"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";

type SetOpenId = (
  update: string | null | ((current: string | null) => string | null),
) => void;

const PickerGroupContext = createContext<{
  openId: string | null;
  setOpenId: SetOpenId;
} | null>(null);

export function PickerGroup({ children }: { children: ReactNode }) {
  const [openId, setOpenIdState] = useState<string | null>(null);
  const setOpenId = useCallback<SetOpenId>((update) => {
    setOpenIdState((current) =>
      typeof update === "function" ? update(current) : update,
    );
  }, []);

  return (
    <PickerGroupContext.Provider value={{ openId, setOpenId }}>
      {children}
    </PickerGroupContext.Provider>
  );
}

export function usePickerOpen() {
  const id = useId();
  const group = useContext(PickerGroupContext);
  const [localOpen, setLocalOpen] = useState(false);
  const open = group ? group.openId === id : localOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!group) {
        setLocalOpen(next);
        return;
      }
      group.setOpenId((current) => {
        if (next) return id;
        return current === id ? null : current;
      });
    },
    [group, id],
  );

  return [open, setOpen] as const;
}
