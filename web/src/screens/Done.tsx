import { Icon } from "../ui.tsx";

interface Action {
  label: string;
  onClick: () => void;
}

/** The "it's saved" screen after recording a payment or adding a customer. */
export function Done({ title, body, primary, secondary, tertiary }: {
  title: string;
  body: string;
  primary: Action;
  secondary?: Action;
  tertiary?: Action;
}) {
  return (
    <section className="done" aria-live="polite">
      <span className="done-mark"><Icon name="check" size={40} stroke={2.6} /></span>
      <h1>{title}</h1>
      <p className="muted">{body}</p>
      <div className="stack done-actions">
        <button className="btn btn-ink btn-block" onClick={primary.onClick}>{primary.label}</button>
        {secondary && <button className="btn btn-ghost btn-block" onClick={secondary.onClick}>{secondary.label}</button>}
        {tertiary && (
          <button className={`link-btn${/undo/i.test(tertiary.label) ? " red" : ""}`} onClick={tertiary.onClick}>
            {/undo/i.test(tertiary.label) && <Icon name="undo" size={16} />} {tertiary.label}
          </button>
        )}
      </div>
    </section>
  );
}
