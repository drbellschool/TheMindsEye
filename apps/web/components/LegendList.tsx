type LegendListProps = {
  items: Array<{ label: string; state: string; note: string }>;
};

export function LegendList({ items }: LegendListProps) {
  return (
    <div className="tag-row">
      {items.map((item) => (
        <span className={`tag state-${item.state}`} key={item.label}>
          <strong>{item.label}</strong>
          <span className="muted">{item.note}</span>
        </span>
      ))}
    </div>
  );
}
