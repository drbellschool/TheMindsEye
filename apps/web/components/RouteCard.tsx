import Link from "next/link";

type RouteCardProps = {
  href: string;
  label: string;
  title: string;
  text: string;
  statLabel: string;
  statValue: string;
  state?: string;
  className?: string;
};

export function RouteCard({ href, label, title, text, statLabel, statValue, state = "reviewing", className = "" }: RouteCardProps) {
  return (
    <Link className={`route-card ${className}`.trim()} href={href}>
      <div className="route-card__header">
        <p className="route-card__label">{label}</p>
        <span className={`route-card__state state-${state}`}>{state.replaceAll("_", " ")}</span>
      </div>
      <div className="route-card__body">
        <h3 className="route-card__title">{title}</h3>
        <p className="route-card__text">{text}</p>
      </div>
      <div className="route-card__footer">
        <span className="route-card__cta">Open route</span>
        <p className={`tag state-${state}`}>
          <strong>{statLabel}:</strong> {statValue}
        </p>
      </div>
    </Link>
  );
}
