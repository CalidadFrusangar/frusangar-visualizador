import React from 'react';
import { Truck, AlertCircle } from 'lucide-react';

// Calendario «Camiones» (2026-11-09): patata granel pendiente de llegar, en el día de LLEGADA
// prevista = fecha de carga + 2 días (el camión tarda entre 1,5 y 2). Para la tele de planta.
// Mismos camiones que «Compras pendientes de recibir» de Odoo.

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MAX_WEEKS = 6;

const toDate = (ymd) => new Date(`${ymd}T12:00:00Z`);
const addDays = (ymd, n) => { const d = toDate(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayIndex = (ymd) => (toDate(ymd).getUTCDay() + 6) % 7; // 0 = lunes
const dayNum = (ymd) => toDate(ymd).getUTCDate();
const monthOf = (ymd) => MONTHS[toDate(ymd).getUTCMonth()];
const short = (ymd) => `${WEEKDAYS[mondayIndex(ymd)].slice(0, 3).toLowerCase()} ${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86_400_000);

function TruckChip({ truck, big }) {
  return (
    <div className={`rounded-xl bg-frusangar-green text-white px-2.5 py-2 shadow-sm ${big ? 'ring-2 ring-frusangar-dark/30' : ''}`}>
      <div className={`font-display font-extrabold uppercase leading-tight ${big ? 'text-xl xl:text-2xl' : 'text-base xl:text-lg'}`}>
        {truck.variety || 'Sin variedad'}
      </div>
      <div className="text-sm font-semibold leading-snug truncate" title={truck.supplier}>{truck.supplier}</div>
      <div className="text-xs text-white/85 leading-snug truncate flex items-center gap-1" title={truck.carrier}>
        <Truck size={12} className="shrink-0" /> {truck.carrier || 'Sin transportista'}
      </div>
      <div className="text-[11px] text-white/75 mt-0.5">cargó {short(truck.loadDate)}{truck.partial ? ' · llegó en parte' : ''}</div>
    </div>
  );
}

export default function TrucksCalendar({ data, error, loading, className = '' }) {
  const trucks = data?.trucks || [];
  const today = data?.today || new Date().toISOString().slice(0, 10);
  const dated = trucks.filter(t => t.arrivalDate);
  const late = dated.filter(t => t.arrivalDate < today);
  const noDate = trucks.filter(t => !t.arrivalDate);

  // Semanas de lunes a domingo: desde esta semana hasta la de la última llegada (mínimo 2, máximo 6)
  const start = addDays(today, -mondayIndex(today));
  const last = dated.reduce((m, t) => (t.arrivalDate > m ? t.arrivalDate : m), today);
  const weeks = Math.min(Math.max(Math.floor(daysBetween(start, last) / 7) + 1, 2), MAX_WEEKS);
  const byDay = new Map();
  for (const t of dated) {
    if (!byDay.has(t.arrivalDate)) byDay.set(t.arrivalDate, []);
    byDay.get(t.arrivalDate).push(t);
  }
  const arrivingToday = byDay.get(today)?.length || 0;
  const arrivingTomorrow = byDay.get(addDays(today, 1))?.length || 0;

  return (
    <section className={`flex-col gap-4 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl xl:text-3xl font-display font-bold text-frusangar-text flex items-center gap-2">
            <Truck className="text-frusangar-green" /> Camiones de patata · llegadas
          </h2>
          <p className="text-sm text-stone-500 mt-0.5">
            Llegada prevista = <b className="text-frusangar-dark">fecha de carga + 2 días</b> (el camión tarda entre 1,5 y 2 días)
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm font-bold">
          <span className="px-3 py-1.5 rounded-xl bg-white border border-stone-200">{trucks.length} pendientes</span>
          <span className="px-3 py-1.5 rounded-xl bg-frusangar-green text-white">Hoy llegan {arrivingToday}</span>
          <span className="px-3 py-1.5 rounded-xl bg-white border border-frusangar-green/40 text-frusangar-dark">Mañana {arrivingTomorrow}</span>
          {late.length > 0 && <span className="px-3 py-1.5 rounded-xl bg-red-600 text-white">{late.length} retrasados</span>}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 flex items-center">
          <AlertCircle className="mr-2 shrink-0" size={20} /> {error}
        </div>
      )}

      {late.length > 0 && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-3">
          <div className="text-sm font-bold text-red-700 mb-2">Retrasados: tenían que haber llegado ya</div>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
            {late.map(t => (
              <div key={t.id} className="rounded-xl bg-red-600 text-white px-2.5 py-2">
                <div className="font-display font-extrabold uppercase text-base">{t.variety || 'Sin variedad'}</div>
                <div className="text-sm font-semibold truncate">{t.supplier}</div>
                <div className="text-xs text-white/85 truncate">{t.carrier || 'Sin transportista'}</div>
                <div className="text-[11px] text-white/80">debía llegar {short(t.arrivalDate)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="h-64 rounded-2xl bg-white/60 animate-pulse" />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[760px] grid grid-cols-7 gap-2">
            {WEEKDAYS.map(w => (
              <div key={w} className="text-center text-xs font-bold uppercase tracking-wider text-stone-400 pb-1">{w}</div>
            ))}
            {Array.from({ length: weeks * 7 }, (_, i) => {
              const d = addDays(start, i);
              const list = byDay.get(d) || [];
              const isToday = d === today;
              const past = d < today;
              return (
                <div
                  key={d}
                  className={`min-h-[130px] xl:min-h-[150px] rounded-2xl p-2 flex flex-col gap-1.5 ${isToday ? 'bg-frusangar-accent/40 ring-2 ring-frusangar-green' : past ? 'bg-stone-100/60' : 'bg-white border border-stone-200/70'}`}
                >
                  <div className={`flex items-center justify-between text-sm font-bold ${past ? 'text-stone-300' : 'text-stone-700'}`}>
                    <span>{dayNum(d)} {(dayNum(d) === 1 || i === 0) && <span className="font-normal text-stone-400">{monthOf(d)}</span>}</span>
                    {isToday && <span className="text-[11px] px-2 py-0.5 rounded-full bg-frusangar-green text-white">HOY</span>}
                  </div>
                  {list.map(t => <TruckChip key={t.id} truck={t} big={isToday} />)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {noDate.length > 0 && (
        <p className="text-sm text-stone-500">
          {noDate.length} camión(es) sin fecha de carga en Odoo: no salen en el calendario ({noDate.map(t => t.name).join(', ')}).
        </p>
      )}
      {data?.fetchedAt && (
        <p className="text-xs text-stone-400">Datos de Odoo · Compras pendientes de recibir · {new Date(data.fetchedAt).toLocaleTimeString('es-ES')}</p>
      )}
    </section>
  );
}
