import Link from "next/link";

type RouteCardProps = {
  href: string;
  label: string;
  title: string;
  text: string;
  statLabel: string;
  statValue: string;
  state?: string;
};

export function RouteCard({ href, label, title, text, statLabel, statValue, state = "reviewing" }: RouteCardProps) {
  return (
    <Link className="route-card" href={href}>
      <p className="route-card__label">{label}</p>
      <h3 className="route-card__title">{title}</h3>
      <p className="route-card__text">{text}</p>
      <p className={`tag state-${state}`}>
        <strong>{statLabel}:</strong> {statValue}
      </p>
    </Link>
  );
}
