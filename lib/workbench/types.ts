export type WorkbenchRole = "member" | "owner";

export type WorkbenchAccount = {
  id: number;
  loginId: string;
  displayName: string;
  role: WorkbenchRole;
  mustChangePin: boolean;
};

export type WorkbenchAdminAccount = WorkbenchAccount & {
  createdAt: string;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  disabledAt: string | null;
};
