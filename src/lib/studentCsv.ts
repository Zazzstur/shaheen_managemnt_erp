export const STUDENT_CSV_HEADERS = [
  "admission_number",
  "full_name",
  "date_of_birth",
  "place_of_birth",
  "gender",
  "religion",
  "caste",
  "mother_tongue",
  "social_category",
  "aadhaar_number",
  "class_name",
  "section",
  "father_name",
  "mother_name",
  "father_aadhaar_number",
  "mother_aadhaar_number",
  "father_mobile",
  "mother_mobile",
  "email",
  "residential_address",
  "transport_required",
  "previous_school_affiliation",
  "previous_school_other",
  "previous_school_name",
  "discount_amount",
  "discount_percent",
  "description",
  "admission_date",
  "amount_paid",
] as const;

export type StudentCsvRow = {
  row: number;
  admissionNumber: string;
  fullName: string;
  dateOfBirth: string;
  placeOfBirth: string;
  gender: string;
  religion: string;
  caste: string;
  motherTongue: string;
  socialCategory: string;
  className: string;
  section: string;
  fatherName: string;
  motherName: string;
  fatherAadhaarNumber: string;
  motherAadhaarNumber: string;
  fatherMobile: string;
  motherMobile: string;
  aadhaarNumber: string;
  email: string;
  residentialAddress: string;
  transportRequired: string;
  previousSchoolAffiliation: string;
  previousSchoolOther?: string;
  previousSchoolName: string;
  discountAmount?: string;
  discountPercent?: string;
  description?: string;
  admissionDate?: string;
  amountPaid?: string;
};

const HEADER_ALIASES: Record<string, keyof StudentCsvRow | "row"> = {
  admission_number: "admissionNumber",
  admissionnumber: "admissionNumber",
  full_name: "fullName",
  fullname: "fullName",
  name: "fullName",
  date_of_birth: "dateOfBirth",
  dateofbirth: "dateOfBirth",
  dob: "dateOfBirth",
  gender: "gender",
  place_of_birth: "placeOfBirth",
  placeofbirth: "placeOfBirth",
  religion: "religion",
  caste: "caste",
  mother_tongue: "motherTongue",
  mothertongue: "motherTongue",
  social_category: "socialCategory",
  socialcategory: "socialCategory",
  class_name: "className",
  classname: "className",
  class: "className",
  section: "section",
  father_name: "fatherName",
  fathername: "fatherName",
  parent_name: "fatherName",
  parentname: "fatherName",
  guardian_name: "fatherName",
  mother_name: "motherName",
  mothername: "motherName",
  father_mobile: "fatherMobile",
  fathermobile: "fatherMobile",
  parent_number: "fatherMobile",
  parentnumber: "fatherMobile",
  parent_phone: "fatherMobile",
  phone: "fatherMobile",
  mother_mobile: "motherMobile",
  mothermobile: "motherMobile",
  father_aadhaar_number: "fatherAadhaarNumber",
  father_aadhaar: "fatherAadhaarNumber",
  fatheraadhaar: "fatherAadhaarNumber",
  mother_aadhaar_number: "motherAadhaarNumber",
  mother_aadhaar: "motherAadhaarNumber",
  motheraadhaar: "motherAadhaarNumber",
  email: "email",
  email_id: "email",
  residential_address: "residentialAddress",
  address: "residentialAddress",
  transport_required: "transportRequired",
  transportation_required: "transportRequired",
  school_transportation: "transportRequired",
  previous_school_affiliation: "previousSchoolAffiliation",
  previous_school_other: "previousSchoolOther",
  previous_school_name: "previousSchoolName",
  aadhaar_number: "aadhaarNumber",
  aadhaarnumber: "aadhaarNumber",
  aadhar_number: "aadhaarNumber",
  aadhaar: "aadhaarNumber",
  aadhar: "aadhaarNumber",
  adhar: "aadhaarNumber",
  discount_amount: "discountAmount",
  discountamount: "discountAmount",
  discount_percent: "discountPercent",
  discountpercent: "discountPercent",
  discount_percentage: "discountPercent",
  description: "description",
  discount_description: "description",
  discount_reason: "description",
  admission_date: "admissionDate",
  admissiondate: "admissionDate",
  date_of_admission: "admissionDate",
  amount_paid: "amountPaid",
  amountpaid: "amountPaid",
  paid_amount: "amountPaid",
  fees_paid: "amountPaid",
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/[\s-]+/g, "_");
}

function parseCsv(text: string) {
  const source = text.replace(/^\uFEFF/, "");
  const headerLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter =
    headerLine.includes(";") && !headerLine.includes(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

export function studentCsvTemplate() {
  return `${STUDENT_CSV_HEADERS.join(",")}\n`;
}

export function parseStudentCsv(text: string): StudentCsvRow[] {
  const table = parseCsv(text).filter((row) =>
    row.some((cell) => cell.trim() !== ""),
  );
  const header = table[0];
  if (!header) {
    throw new Error("The CSV file is empty");
  }

  const columns = header.map((cell) => HEADER_ALIASES[normalizeHeader(cell)]);
  const required = [
    "fullName",
    "className",
    "fatherName",
    "fatherMobile",
  ] as const;
  const missing = required.filter((key) => !columns.includes(key));
  if (missing.length > 0) {
    throw new Error(
      "CSV is missing columns. Download the template and use those headings.",
    );
  }

  return table.slice(1).map((cells, index) => {
    const record: Partial<StudentCsvRow> = { row: index + 2 };
    columns.forEach((key, columnIndex) => {
      if (!key || key === "row") {
        return;
      }
      const value = (cells[columnIndex] ?? "").trim();
      if (
        key === "previousSchoolOther" ||
        key === "discountAmount" ||
        key === "discountPercent" ||
        key === "description" ||
        key === "admissionDate" ||
        key === "amountPaid"
      ) {
        record[key] = value || undefined;
        return;
      }
      record[key] = value;
    });
    return {
      row: record.row ?? index + 2,
      admissionNumber: record.admissionNumber ?? "",
      fullName: record.fullName ?? "",
      dateOfBirth: record.dateOfBirth ?? "",
      placeOfBirth: record.placeOfBirth ?? "",
      gender: record.gender ?? "",
      religion: record.religion ?? "",
      caste: record.caste ?? "",
      motherTongue: record.motherTongue ?? "",
      socialCategory: record.socialCategory ?? "",
      className: record.className ?? "",
      section: record.section ?? "",
      fatherName: record.fatherName ?? "",
      motherName: record.motherName ?? "",
      fatherAadhaarNumber: record.fatherAadhaarNumber ?? "",
      motherAadhaarNumber: record.motherAadhaarNumber ?? "",
      fatherMobile: record.fatherMobile ?? "",
      motherMobile: record.motherMobile ?? "",
      aadhaarNumber: record.aadhaarNumber ?? "",
      email: record.email ?? "",
      residentialAddress: record.residentialAddress ?? "",
      transportRequired: record.transportRequired ?? "",
      previousSchoolAffiliation: record.previousSchoolAffiliation ?? "",
      previousSchoolOther: record.previousSchoolOther,
      previousSchoolName: record.previousSchoolName ?? "",
      discountAmount: record.discountAmount,
      discountPercent: record.discountPercent,
      description: record.description,
      admissionDate: record.admissionDate,
      amountPaid: record.amountPaid,
    };
  });
}
