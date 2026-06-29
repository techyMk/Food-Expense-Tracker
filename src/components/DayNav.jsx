export default function DayNav({ selectedDate, label, onShift, onPick, onToday }) {
  return (
    <>
      <nav className="day-nav card">
        <button className="btn btn-round" type="button" aria-label="Previous day" onClick={() => onShift(-1)}>‹</button>
        <div className="day-nav-center">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => e.target.value && onPick(e.target.value)}
          />
          <div className="day-label">{label}</div>
        </div>
        <button className="btn btn-round" type="button" aria-label="Next day" onClick={() => onShift(1)}>›</button>
      </nav>
      <div className="today-row">
        <button className="btn btn-ghost small" type="button" onClick={onToday}>Jump to today</button>
      </div>
    </>
  );
}
