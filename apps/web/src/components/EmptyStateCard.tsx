import type { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
  testId?: string;
  icon?: ReactNode;
}

export function EmptyStateCard({ title, children, testId, icon }: Props) {
  return (
    <div className="mp5-card px-5 py-6 text-center sm:text-left" data-testid={testId}>
      {icon && <div className="mb-3 flex justify-center sm:justify-start text-accent/40">{icon}</div>}
      <h3 className="text-base font-semibold text-gray-200 mb-2">{title}</h3>
      <div className="text-sm text-gray-500 space-y-2 leading-relaxed">{children}</div>
    </div>
  );
}
