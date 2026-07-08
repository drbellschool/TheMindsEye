type KeyValueListProps = {
  items: Array<{ label: string; value: string; detail?: string }>;
  dense?: boolean;
};

export function KeyValueList({ items, dense = false }: KeyValueListProps) {
  return (
    <dl className={`value-grid ${dense ? "value-grid--dense" : ""}`.trim()}>
      {items.map((item) => (
        <div className="value-card" key={item.label}>
          <dt className="muted">{item.label}</dt>
          <dd>
            <strong>{item.value}</strong>
            {item.detail ? <p className="small-muted">{item.detail}</p> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
