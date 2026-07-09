import type { ReactNode } from "react";

type PanelProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  tone?: "paper" | "dark" | "map" | "blueprint";
  className?: string;
  children: ReactNode;
  action?: ReactNode;
};

export function Panel({ eyebrow, title, subtitle, tone = "paper", className = "", children, action }: PanelProps) {
  return (
    <section className={`panel panel--${tone} ${className}`.trim()}>
      <div className="panel__header">
        <div>
          {eyebrow ? <p className="panel__eyebrow">{eyebrow}</p> : null}
          <h2 className="panel__title">{title}</h2>
          {subtitle ? <p className="panel__note">{subtitle}</p> : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      <div className="panel__body">{children}</div>
    </section>
  );
}
