import { SlideShell } from "../components/slide-shell";

export function Slide10TwoReaders({ totalPages }: { totalPages: number }) {
  return (
    <SlideShell sectionLabel="08 / AUDIENCE" pageNumber={10} totalPages={totalPages}>
      <div className="eyebrow">08 / WHO IT SERVES</div>
      <h2 className="title" style={{ fontSize: 72 }}>
        Two readers. One <em>data set</em>.
      </h2>
      <p className="body-text" style={{ marginTop: 20, fontSize: 24 }}>
        Different roles, different views — both grounded in{" "}
        <span className="accent">one shared source of truth</span>. Bematist is the instrument they
        both need.
      </p>

      <div className="readers">
        <div className="reader-col">
          <span className="reader-role">The Leader</span>
          <h3>VP of Engineering, CTO, Director of Engineering.</h3>
          <p className="muted" style={{ fontSize: "var(--t-body)", margin: 0, lineHeight: 1.4 }}>
            Needs defensible spend numbers when the board asks, and clarity on which workflows ship
            code.
          </p>
          <div className="reader-sees">Sees</div>
          <ul className="reader-list">
            <li>Spend allocation by repo and team</li>
            <li>Cost per merged PR</li>
            <li>Team-level efficiency patterns</li>
            <li>Operational clarity</li>
          </ul>
        </div>
        <div className="reader-col">
          <span className="reader-role">The Engineer</span>
          <h3>Senior. Already using AI but has no time to see their own patterns.</h3>
          <p className="muted" style={{ fontSize: "var(--t-body)", margin: 0, lineHeight: 1.4 }}>
            Wants to know what's working in their workflow — and where the wasted token cycles are
            hiding.
          </p>
          <div className="reader-sees">Sees</div>
          <ul className="reader-list">
            <li>Personal session log</li>
            <li>Workflow efficiency</li>
            <li>Twin finder — peers solving the same thing</li>
            <li>Patterns worth copying</li>
          </ul>
        </div>
      </div>
    </SlideShell>
  );
}
