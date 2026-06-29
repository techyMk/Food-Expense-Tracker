import { ChevronLeft, ChevronRight } from "lucide-react";
import DatePicker from "./DatePicker";

export default function DayNav({ selectedDate, label, onShift, onPick, onToday }) {
  return (
    <>
      <nav className="day-nav card">
        <button className="btn btn-round" type="button" aria-label="Previous day" onClick={() => onShift(-1)}>
          <ChevronLeft size={22} />
        </button>
        <div className="day-nav-center">
          <DatePicker value={selectedDate} onChange={onPick} />
          <div className="day-label">{label}</div>
        </div>
        <button className="btn btn-round" type="button" aria-label="Next day" onClick={() => onShift(1)}>
          <ChevronRight size={22} />
        </button>
      </nav>
      <div className="today-row">
        <button className="btn btn-ghost small" type="button" onClick={onToday}>Jump to today</button>
      </div>
    </>
  );
}
