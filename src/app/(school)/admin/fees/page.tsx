"use client";

import { useEffect, useRef, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Download } from "lucide-react";
import { domToBlob } from "modern-screenshot";
import { toast } from "sonner";
import { mutationResult } from "@/lib/result";
import { downloadCsv } from "@/lib/downloadCsv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FeeOverview } from "./fee-overview";

function money(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function longDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) {
    return iso;
  }
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type PaymentMode = "cash" | "online";

const paymentModeLabel: Record<PaymentMode, string> = {
  cash: "Cash",
  online: "Online",
};

type Coverage = "paid" | "partial" | "due" | "upcoming" | "advance";

const coverageLabel: Record<Coverage, string> = {
  paid: "Paid",
  partial: "Part paid",
  due: "Due",
  upcoming: "Upcoming",
  advance: "From advance",
};

type Account = {
  monthlyRate: number;
  chargedToDate: number;
  paid: number;
  due: number;
  advance: number;
  yearTotal: number;
  priorDue: number;
  months: Array<{
    month: string;
    label: string;
    charge: number;
    applied: number;
    balance: number;
    coverage: Coverage;
  }>;
};

type Statement = {
  studentId: Id<"students">;
  studentName: string;
  admissionNumber: string;
  classLabel: string;
  year: number;
  academicEarlierPayments: number;
  academic: Account;
  transportAssigned: boolean;
  transportRouteName?: string;
  transportFromMonth?: string;
  transport: Account;
  academicPayments: Array<{
    id: Id<"feePayments">;
    amount: number;
    paidOn: string;
    note?: string;
  }>;
  transportPayments: Array<{
    id: Id<"feePayments">;
    amount: number;
    paidOn: string;
    note?: string;
  }>;
};

type FeeStatusFilter = "all" | "due" | "paid";

const feeStatusLabel: Record<FeeStatusFilter, string> = {
  all: "All",
  due: "Due",
  paid: "Paid",
};

type StudentHit = {
  studentId: Id<"students">;
  studentName: string;
  admissionNumber: string;
  classLabel: string;
  totalDue?: number;
};

const nativeSelectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm";

function FeePanel({
  title,
  description,
  account,
  earlierPayments,
  payments,
  canCollect,
  collectLabel,
  requireMode = false,
  onCollect,
  onOpenInvoice,
}: {
  title: string;
  description: string;
  account: Account;
  earlierPayments?: number;
  payments: Statement["academicPayments"];
  canCollect: boolean;
  collectLabel: string;
  requireMode?: boolean;
  onCollect: (amount: number, mode?: PaymentMode) => Promise<void>;
  onOpenInvoice?: (paymentId: Id<"feePayments">) => void;
}) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingAmount, setPendingAmount] = useState<number | null>(null);
  const [mode, setMode] = useState<PaymentMode | null>(null);

  async function collect(value: number, chosen?: PaymentMode) {
    setSaving(true);
    try {
      await onCollect(value, chosen);
      setAmount("");
      setPendingAmount(null);
      setMode(null);
    } catch {
      // onCollect already reported the error; keep the form for a retry.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">
          {money(account.monthlyRate)}
          <span className="ml-2 text-base font-normal text-muted-foreground">
            / month
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Due now</p>
            <p className="text-lg font-medium tabular-nums">
              {money(account.due)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Advance</p>
            <p className="text-lg font-medium tabular-nums">
              {money(account.advance)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Paid</p>
            <p className="text-lg font-medium tabular-nums">
              {money(account.paid)}
            </p>
          </div>
        </div>
        {account.priorDue > 0 ? (
          <p className="text-sm text-muted-foreground">
            {money(account.priorDue)} of the amount due is from months before{" "}
            {account.months[0]?.label.slice(-4) ?? "this year"}.
          </p>
        ) : null}
        {earlierPayments && earlierPayments > 0 ? (
          <p className="text-sm text-muted-foreground">
            {money(earlierPayments)} from earlier invoices is counted toward
            academic fees.
          </p>
        ) : null}
        {account.months.length === 0 ? (
          <p className="text-sm text-muted-foreground">No months to charge.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Month</th>
                  <th className="py-2 pr-3 font-medium">Fee</th>
                  <th className="py-2 pr-3 font-medium">Applied</th>
                  <th className="py-2 pr-3 font-medium">Left</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {account.months.map((month) => (
                  <tr key={month.month} className="border-b last:border-0">
                    <td className="py-2 pr-3">{month.label}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {money(month.charge)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {money(month.applied)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {money(month.balance)}
                    </td>
                    <td className="py-2">{coverageLabel[month.coverage]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canCollect ? (
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={async (event) => {
              event.preventDefault();
              const parsed = Number(amount);
              if (!Number.isFinite(parsed) || parsed <= 0) {
                toast.error("Enter an amount greater than 0");
                return;
              }
              if (requireMode) {
                setMode(null);
                setPendingAmount(parsed);
                return;
              }
              await collect(parsed);
            }}
          >
            <div className="grid flex-1 gap-2">
              <Label htmlFor={`${title}-amount`}>Amount</Label>
              <Input
                id={`${title}-amount`}
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Any amount"
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : collectLabel}
            </Button>
          </form>
        ) : null}
        {requireMode ? (
          <Dialog
            open={pendingAmount !== null}
            onOpenChange={(open) => {
              if (!open && !saving) {
                setPendingAmount(null);
                setMode(null);
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Payment mode</DialogTitle>
                <DialogDescription>
                  How was {money(pendingAmount ?? 0)} paid? Choose one to save
                  the payment.
                </DialogDescription>
              </DialogHeader>
              <div
                role="radiogroup"
                aria-label="Payment mode"
                className="grid grid-cols-2 gap-2"
              >
                {(["cash", "online"] as const).map((option) => (
                  <Button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={mode === option}
                    variant={mode === option ? "default" : "outline"}
                    size="lg"
                    disabled={saving}
                    onClick={() => setMode(option)}
                  >
                    {paymentModeLabel[option]}
                  </Button>
                ))}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setPendingAmount(null);
                    setMode(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!mode || saving || pendingAmount === null}
                  onClick={() => {
                    if (mode && pendingAmount !== null) {
                      void collect(pendingAmount, mode);
                    }
                  }}
                >
                  {saving ? "Saving…" : "Save payment"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
        {payments.length > 0 ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium">Payments</p>
            {payments.map((payment) => (
              <p key={payment.id} className="text-muted-foreground">
                {payment.paidOn}: {money(payment.amount)}
                {payment.note ? ` · ${payment.note}` : ""}
                {onOpenInvoice ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="font-medium text-foreground underline"
                      onClick={() => onOpenInvoice(payment.id)}
                    >
                      Invoice
                    </button>
                  </>
                ) : null}
              </p>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

const NAVY_RULE =
  "border-t-4 border-[#1B2A5E] print:[print-color-adjust:exact]";

function InvoiceDetail({
  label,
  value,
  onActivate,
}: {
  label: string;
  value: string;
  onActivate?: () => void;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-neutral-600">
        {label}
      </p>
      {onActivate ? (
        <button
          type="button"
          className="text-left font-medium text-[#1B2A5E] underline decoration-[#1B2A5E]/40 underline-offset-2 print:text-neutral-900 print:no-underline"
          onClick={onActivate}
        >
          {value}
        </button>
      ) : (
        <p className="font-medium">{value}</p>
      )}
    </div>
  );
}

function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits;
  }
  return digits.length >= 10 ? digits : null;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function placeInvoiceInWhatsApp(phone: string, caption: string, file: File) {
  try {
    const imageBase64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
    const response = await fetch("/api/whatsapp-desktop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, caption, imageBase64 }),
    });
    if (!response.ok) {
      return null;
    }
    const result = (await response.json()) as { ok?: boolean; pasted?: boolean };
    if (!result.ok) {
      return null;
    }
    return result.pasted ? "pasted" : "opened";
  } catch {
    return null;
  }
}

function FeeInvoice({ paymentId }: { paymentId: Id<"feePayments"> }) {
  const invoice = useQuery(api.fees.paymentInvoice, { paymentId });
  const savedMessage = useQuery(api.fees.invoiceMessage);
  const setInvoiceMessage = useMutation(api.fees.setInvoiceMessage);
  const [draft, setDraft] = useState<string | null>(null);
  const [photoReady, setPhotoReady] = useState(false);
  const [sharing, setSharing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<File | null>(null);
  const sharingRef = useRef(false);
  const message = draft ?? savedMessage ?? "";

  useEffect(() => {
    if (!invoice) {
      return;
    }
    let cancelled = false;
    setPhotoReady(false);
    photoRef.current = null;
    const timer = window.setTimeout(() => {
      const sheet = sheetRef.current;
      if (!sheet || cancelled) {
        return;
      }
      void domToBlob(sheet, {
        backgroundColor: "#FDFBF3",
        scale: 2,
      })
        .then((blob) => {
          if (cancelled) {
            return;
          }
          photoRef.current = new File(
            [blob],
            `invoice-${invoice.admissionNumber}.png`,
            { type: "image/png" },
          );
          setPhotoReady(true);
        })
        .catch(() => {
          if (!cancelled) {
            setPhotoReady(false);
            toast.error("Could not create the invoice photo");
          }
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [invoice]);

  if (invoice === undefined || savedMessage === undefined) {
    return <p className="text-sm text-muted-foreground">Loading invoice…</p>;
  }
  const details: Array<{
    label: string;
    value: string;
    phone?: string;
  }> = [
    { label: "Admission number", value: invoice.admissionNumber },
    { label: "Student name", value: invoice.studentName },
    { label: "Class", value: invoice.classLabel },
    { label: "Session", value: invoice.session },
  ];
  if (invoice.fatherName) {
    details.push({ label: "Father name", value: invoice.fatherName });
  }
  if (invoice.fatherPhone) {
    details.push({
      label: "Father mobile",
      value: invoice.fatherPhone,
      phone: invoice.fatherPhone,
    });
  }
  if (invoice.motherName) {
    details.push({ label: "Mother name", value: invoice.motherName });
  }
  if (invoice.motherPhone) {
    details.push({
      label: "Mother mobile",
      value: invoice.motherPhone,
      phone: invoice.motherPhone,
    });
  }

  async function persistMessage(next: string) {
    const trimmed = next.trim().slice(0, 500);
    if (trimmed === savedMessage) {
      return;
    }
    await setInvoiceMessage({ message: trimmed });
  }

  async function shareInvoice(phone: string) {
    const number = whatsappNumber(phone);
    if (!number) {
      toast.error("This number cannot be opened in WhatsApp");
      return;
    }
    const file = photoRef.current;
    if (!file) {
      toast.error("The invoice photo is still being prepared");
      return;
    }
    if (sharingRef.current) {
      return;
    }
    sharingRef.current = true;
    setSharing(true);
    void persistMessage(message).catch((error: unknown) => {
      toast.error(mutationResult(error).message);
    });
    const caption = message.trim();
    const placed = await placeInvoiceInWhatsApp(number, caption, file);
    if (placed === "pasted") {
      sharingRef.current = false;
      setSharing(false);
      toast.message(
        "The invoice photo is in that WhatsApp chat, with your message. Press send.",
      );
      return;
    }
    if (placed === "opened") {
      sharingRef.current = false;
      setSharing(false);
      toast.message(
        "WhatsApp is open on that number. Press Ctrl+V to add the invoice photo, then send.",
      );
      return;
    }
    const appLink = document.createElement("a");
    appLink.href = `whatsapp://send?phone=${number}&text=${encodeURIComponent(caption)}`;
    appLink.click();
    let copied = false;
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": file }),
        ]);
        copied = true;
      } catch {
        copied = false;
      }
    }
    if (!copied) {
      const objectUrl = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }
    toast.message(
      copied
        ? "The WhatsApp app is opening with your message. Paste the invoice photo into that chat."
        : "The WhatsApp app is opening with your message. Attach the downloaded invoice photo in that chat.",
    );
    sharingRef.current = false;
    setSharing(false);
  }

  const parentPhones = details.filter((detail) => detail.phone);

  return (
    <div className="space-y-4">
    <div
      ref={sheetRef}
      className="fee-invoice-sheet space-y-4 rounded-md bg-[#FDFBF3] p-5 text-neutral-900 print:rounded-none print:p-0 print:[print-color-adjust:exact]"
    >
      <div className="flex flex-col items-center gap-1">
        <img
          src="/shaheen-academy-logo.svg"
          alt="Shaheen Academy crest"
          className="h-24 w-auto"
        />
        <p className="text-center text-lg font-bold tracking-wide">
          SHAHEEN ACADEMY CHAMPARAN
        </p>
        <p className="max-w-full text-center text-xs leading-snug text-balance">
          Shaheen Chowk Murli,Post. Pachpakari,P.S. Dhaka,Distt. East
          Champaran,Bihar-845427
        </p>
        <p className="mt-1 text-sm font-semibold uppercase tracking-wider">
          {invoice.kind === "transport"
            ? "Transport fee invoice"
            : "Academic fee invoice"}
        </p>
      </div>

      <div className={NAVY_RULE} />

      <section className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {details.map((detail) => (
          <InvoiceDetail
            key={detail.label}
            label={detail.label}
            value={detail.value}
            onActivate={
              detail.phone
                ? () => {
                    void shareInvoice(detail.phone as string);
                  }
                : undefined
            }
          />
        ))}
      </section>

      <div className={NAVY_RULE} />

      <section className="grid grid-cols-3 gap-3 text-sm">
        <InvoiceDetail label="Total due" value={money(invoice.dueBefore)} />
        <InvoiceDetail label="Amount paid" value={money(invoice.amount)} />
        {invoice.advanceAfter > 0 ? (
          <InvoiceDetail
            label="Advance after payment"
            value={money(invoice.advanceAfter)}
          />
        ) : (
          <InvoiceDetail
            label="Due after payment"
            value={money(invoice.dueAfter)}
          />
        )}
      </section>

      <div className={NAVY_RULE} />

      <section>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-400 text-left">
              <th className="py-1.5 pr-3 font-semibold">Description</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Due</th>
              <th className="py-1.5 text-right font-semibold">Paid</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr
                key={line.month}
                className="border-b border-neutral-200 last:border-0"
              >
                <td className="py-1.5 pr-3">
                  {invoice.kind === "transport" ? "Transport fee" : "Tuition fee"}{" "}
                  ({line.label})
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {money(line.dueBefore)}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {money(line.paid)}
                </td>
              </tr>
            ))}
            {invoice.unallocated > 0 ? (
              <tr>
                <td className="py-1.5 pr-3">
                  Advance beyond {invoice.session}
                </td>
                <td className="py-1.5 pr-3 text-right">—</td>
                <td className="py-1.5 text-right tabular-nums">
                  {money(invoice.unallocated)}
                </td>
              </tr>
            ) : null}
            {invoice.lines.length === 0 && invoice.unallocated <= 0 ? (
              <tr>
                <td colSpan={3} className="py-1.5 text-neutral-600">
                  {invoice.kind === "transport"
                    ? "No transport months were charged for this payment."
                    : "No tuition months were charged for this payment."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <div className={NAVY_RULE} />

      <section className="grid grid-cols-2 gap-3 text-sm">
        <InvoiceDetail label="Date of payment" value={longDate(invoice.paidOn)} />
        <InvoiceDetail
          label="Payment mode"
          value={invoice.mode ? paymentModeLabel[invoice.mode] : "Not recorded"}
        />
      </section>
    </div>
    <div className="space-y-3 print:hidden">
      <div className="space-y-1.5">
        <Label htmlFor="invoice-message">Message</Label>
        <Textarea
          id="invoice-message"
          value={message}
          maxLength={500}
          placeholder="This note is sent with every student's invoice until you change it."
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            void persistMessage(message).catch((error: unknown) => {
              toast.error(mutationResult(error).message);
            });
          }}
        />
      </div>
      {parentPhones.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {parentPhones.map((detail) => (
            <Button
              key={detail.label}
              type="button"
              variant="outline"
              disabled={!photoReady || sharing}
              onClick={() => {
                void shareInvoice(detail.phone as string);
              }}
            >
              {sharing
                ? "Opening WhatsApp…"
                : photoReady
                  ? `WhatsApp ${detail.label.toLowerCase()} ${detail.value}`
                  : "Preparing invoice photo…"}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No parent mobile number is on file for this student.
        </p>
      )}
    </div>
    </div>
  );
}

function FeeInvoiceDialog({
  paymentId,
  onClose,
}: {
  paymentId: Id<"feePayments"> | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={paymentId !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[92vh] overflow-y-auto sm:max-w-2xl print:static print:max-h-none print:w-full print:max-w-none print:translate-x-0 print:translate-y-0 print:overflow-visible print:bg-transparent print:p-0 print:ring-0">
        <DialogHeader className="print:hidden">
          <DialogTitle>Payment saved</DialogTitle>
          <DialogDescription>
            Print this invoice or send the photo on WhatsApp.
          </DialogDescription>
        </DialogHeader>
        {paymentId ? <FeeInvoice paymentId={paymentId} /> : null}
        <DialogFooter className="print:hidden">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={() => window.print()}>
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatementView({
  statement,
  canCollect,
  asOf,
}: {
  statement: Statement;
  canCollect: boolean;
  asOf: string;
}) {
  const recordSettlement = useMutation(api.fees.recordSettlement);
  const [invoicePaymentId, setInvoicePaymentId] =
    useState<Id<"feePayments"> | null>(null);
  const transportDescription = statement.transportAssigned
    ? `${statement.transportRouteName ?? "Assigned route"}. Charged only from ${statement.transportFromMonth ?? "the assignment"} onward. Extra payment stays as advance and covers later months.`
    : "This student is not assigned to transport, so no transport fee is charged.";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">
          {statement.studentName}{" "}
          <span className="text-muted-foreground">
            {statement.admissionNumber}
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {statement.classLabel} · {statement.year}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <FeePanel
          title="Academic fee"
          description="Charged for every month of the year, including months before admission. A larger payment becomes advance and is used on later months."
          account={statement.academic}
          earlierPayments={statement.academicEarlierPayments}
          payments={statement.academicPayments}
          canCollect={canCollect}
          collectLabel="Collect academic fee"
          requireMode
          onOpenInvoice={setInvoicePaymentId}
          onCollect={async (amount, mode) => {
            if (!mode) {
              toast.error("Choose a payment mode");
              throw new Error("Payment mode is required");
            }
            try {
              const paymentId = await recordSettlement({
                studentId: statement.studentId,
                kind: "academic",
                amount,
                paidOn: asOf,
                mode,
              });
              toast.success("Academic fee recorded");
              setInvoicePaymentId(paymentId);
            } catch (error) {
              toast.error(mutationResult(error).message);
              throw error;
            }
          }}
        />
        <FeePanel
          title="Transport fee"
          description={transportDescription}
          account={statement.transport}
          payments={statement.transportPayments}
          canCollect={canCollect && statement.transportAssigned}
          collectLabel="Collect transport fee"
          requireMode
          onOpenInvoice={setInvoicePaymentId}
          onCollect={async (amount, mode) => {
            if (!mode) {
              toast.error("Choose a payment mode");
              throw new Error("Payment mode is required");
            }
            try {
              const paymentId = await recordSettlement({
                studentId: statement.studentId,
                kind: "transport",
                amount,
                paidOn: asOf,
                mode,
              });
              toast.success("Transport fee recorded");
              setInvoicePaymentId(paymentId);
            } catch (error) {
              toast.error(mutationResult(error).message);
              throw error;
            }
          }}
        />
      </div>
      <FeeInvoiceDialog
        paymentId={invoicePaymentId}
        onClose={() => setInvoicePaymentId(null)}
      />
    </div>
  );
}

export default function FeesPage() {
  const me = useQuery(api.users.me);
  const convex = useConvex();
  const [asOf] = useState(todayIso);
  const [term, setTerm] = useState("");
  const [classId, setClassId] = useState("");
  const [feeStatus, setFeeStatus] = useState<FeeStatusFilter>("all");
  const [studentId, setStudentId] = useState<Id<"students"> | null>(null);
  const [downloading, setDownloading] = useState(false);
  const trimmed = term.trim();
  const isAdmin = me?.role === "super_admin";
  const idle = classId === "" && trimmed.length === 0;
  const filtering =
    classId !== "" || (feeStatus !== "all" && trimmed.length >= 1);
  const classes = useQuery(api.catalog.listClasses, isAdmin ? {} : "skip");
  const nameMatches = useQuery(
    api.fees.searchStudents,
    isAdmin && !filtering && trimmed.length >= 1 ? { term: trimmed } : "skip",
  );
  const filteredMatches = useQuery(
    api.fees.filterStudents,
    isAdmin && filtering
      ? {
          asOf,
          term: trimmed,
          feeStatus,
          ...(classId ? { classId: classId as Id<"classes"> } : {}),
        }
      : "skip",
  );
  const matches: StudentHit[] | undefined = filtering
    ? filteredMatches
    : nameMatches;
  const searchKey = `${classId}|${feeStatus}|${trimmed}`;
  const handledSearchKey = useRef<string | null>(null);
  const statement = useQuery(
    api.fees.statement,
    isAdmin && studentId ? { studentId, asOf } : "skip",
  );
  const mine = useQuery(
    api.fees.myStatements,
    me && !isAdmin && (me.role === "parent" || me.role === "student")
      ? { asOf }
      : "skip",
  );

  useEffect(() => {
    if (!matches) {
      return;
    }
    // Filtered results change when a payment is saved (Due/Paid); only react to
    // new filter input so the open statement and its invoice stay put.
    if (filtering) {
      if (handledSearchKey.current === searchKey) {
        return;
      }
      handledSearchKey.current = searchKey;
    } else {
      handledSearchKey.current = null;
    }
    if (matches.length === 1) {
      setStudentId(matches[0].studentId);
      return;
    }
    if (
      studentId &&
      !matches.some((match) => match.studentId === studentId)
    ) {
      setStudentId(null);
    }
  }, [matches, studentId, filtering, searchKey]);

  if (me === undefined) {
    return <p className="text-sm text-muted-foreground">Loading fees…</p>;
  }

  function chooseClass(next: string) {
    setClassId(next);
    if (next === "") {
      setStudentId(null);
    }
  }

  async function downloadFees() {
    setDownloading(true);
    try {
      const rows = await convex.query(api.fees.exportRows, { asOf });
      downloadCsv(
        `fees-${asOf}.csv`,
        [
          "admission_number",
          "student_name",
          "class",
          "academic_monthly_fee",
          "academic_paid",
          "academic_due",
          "transport_route",
          "transport_monthly_fee",
          "transport_paid",
          "transport_due",
          "total_paid",
          "total_due",
        ],
        rows.map((row) => [
          row.admissionNumber,
          row.studentName,
          row.classLabel,
          row.academicMonthlyFee.toFixed(2),
          row.academicPaid.toFixed(2),
          row.academicDue.toFixed(2),
          row.transportRoute,
          row.transportMonthlyFee.toFixed(2),
          row.transportPaid.toFixed(2),
          row.transportDue.toFixed(2),
          row.totalPaid.toFixed(2),
          row.totalDue.toFixed(2),
        ]),
      );
      toast.success(
        `Downloaded fees for ${rows.length} student${rows.length === 1 ? "" : "s"}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download");
    } finally {
      setDownloading(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fees</h1>
          <p className="text-sm text-muted-foreground">
            Academic fees and transport fees for this year.
          </p>
        </div>
        {mine === undefined ? (
          <p className="text-sm text-muted-foreground">Loading fees…</p>
        ) : mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No student record is linked to this account.
          </p>
        ) : (
          mine.map((item) => (
            <StatementView
              key={item.studentId}
              statement={item}
              canCollect={false}
              asOf={asOf}
            />
          ))
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fees</h1>
          <p className="text-sm text-muted-foreground">
            Search a student by name or admission number, then collect academic
            fees and transport fees separately.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={downloading}
          onClick={() => void downloadFees()}
        >
          <Download />
          {downloading ? "Downloading…" : "Download CSV"}
        </Button>
      </div>

      <FeeOverview asOf={asOf} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-60 max-w-xl flex-1 gap-2">
          <Label htmlFor="fee-search">Student</Label>
          <Input
            id="fee-search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Name or admission number"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="fee-class-filter">Class</Label>
          <select
            id="fee-class-filter"
            value={classId}
            onChange={(event) => chooseClass(event.target.value)}
            className={nativeSelectClass}
          >
            <option value="">No classes</option>
            {(classes ?? []).map((classroom) => (
              <option key={classroom._id} value={classroom._id}>
                {`${classroom.name} ${classroom.section}`.trim()}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="fee-status-filter">Fee status</Label>
          <select
            id="fee-status-filter"
            value={feeStatus}
            onChange={(event) =>
              setFeeStatus(event.target.value as FeeStatusFilter)
            }
            className={nativeSelectClass}
          >
            {(["all", "due", "paid"] as const).map((option) => (
              <option key={option} value={option}>
                {feeStatusLabel[option]}
              </option>
            ))}
          </select>
        </div>
        {classId ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => chooseClass("")}
          >
            Clear class
          </Button>
        ) : null}
      </div>

      {idle ? (
        <p className="text-sm text-muted-foreground">
          Select a class, or search by name or admission number.
        </p>
      ) : null}
      {(filtering || trimmed.length >= 1) && matches === undefined ? (
        <p className="text-sm text-muted-foreground">
          {filtering ? "Loading students…" : "Searching…"}
        </p>
      ) : null}
      {matches && matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {filtering
            ? "No students match these filters."
            : "No matching student."}
        </p>
      ) : null}
      {matches && (matches.length > 1 || (filtering && matches.length === 1)) ? (
        <div className="flex flex-col gap-2">
          {filtering ? (
            <p className="text-sm text-muted-foreground">
              {matches.length} student{matches.length === 1 ? "" : "s"}
            </p>
          ) : null}
          {matches.map((match) => (
            <button
              key={match.studentId}
              type="button"
              aria-pressed={match.studentId === studentId}
              className="rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted aria-pressed:bg-muted"
              onClick={() => setStudentId(match.studentId)}
            >
              <span className="font-medium">{match.studentName}</span>
              <span className="text-muted-foreground">
                {" "}
                · {match.admissionNumber} · {match.classLabel}
                {match.totalDue !== undefined
                  ? match.totalDue > 0
                    ? ` · Due ${money(match.totalDue)}`
                    : " · Paid"
                  : ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {studentId && statement === undefined ? (
        <p className="text-sm text-muted-foreground">Loading fees…</p>
      ) : null}
      {statement ? (
        <StatementView statement={statement} canCollect asOf={asOf} />
      ) : null}
    </div>
  );
}
