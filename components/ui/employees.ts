// reviewer roster - for demo purposes this is a fixed lookup table rather
// than a real employee directory. Each reviewer has an official TTB-style
// employee ID used on approval/rejection certificates.
export const EMPLOYEES: { id: string; name: string }[] = [
  { id: "TTB-10234", name: "Alex Johnson" },
  { id: "TTB-10567", name: "Brooke Smith" },
  { id: "TTB-10892", name: "Casey Lee" },
];

export const getEmployeeName = (employeeId: string | null | undefined): string =>
  EMPLOYEES.find((e) => e.id === employeeId)?.name || employeeId || "—";
