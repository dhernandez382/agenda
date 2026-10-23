/* Mi Agenda · app personal (PWA). Sin servidor: los datos quedan en este dispositivo y, si conectas Google, en tu Google Calendar. */
'use strict';

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const sumaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const inicioDia = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nombreDia = d => `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
const hora12 = h => { if (!h) return 'Todo el día'; const [H, M] = h.split(':').map(Number); return `${H % 12 || 12}:${pad(M)} ${H < 12 ? 'a. m.' : 'p. m.'}`; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const TIPOS = { cita: 'Cita', reunion: 'Reunión', recordatorio: 'Recordatorio', fecha: 'Fecha importante' };

function avisar(texto) {
  const t = $('#aviso'); t.textContent = texto; t.hidden = false;
  clearTimeout(avisar.t); avisar.t = setTimeout(() => (t.hidden = true), 4200);
}

/* ---------- estado local ---------- */
const CLAVE = 'agenda.v1';
/* ID de cliente de Google (no es secreto; solo funciona desde las direcciones autorizadas en Google Cloud) */
const CLIENT_ID_PREDETERMINADO = '871703100906-6k8uu8po9v5jg1vr9bsuq3vrj49116tn.apps.googleusercontent.com';
let S = { eventos: [], taxHecho: {}, taxOff: {}, disparados: {}, clientId: CLIENT_ID_PREDETERMINADO, hechos: {}, apuntes: '', metas: {} };
try { S = Object.assign(S, JSON.parse(localStorage.getItem(CLAVE) || '{}')); } catch (e) { /* primera vez */ }
const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(S)); } catch (e) { avisar('No pude guardar en este dispositivo.'); } };

/* ---------- Google (Calendar + Gmail) ---------- */
const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly';
let token = null, tokenExp = 0, tokenClient = null, gEventosCache = null;
try { const t = JSON.parse(sessionStorage.getItem('agenda.token') || 'null'); if (t && t.exp > Date.now()) { token = t.v; tokenExp = t.exp; } } catch (e) { /* sin token */ }
const conectado = () => !!token && Date.now() < tokenExp;

function cargarGIS() {
  return new Promise((ok, fallo) => {
    if (window.google && google.accounts) return ok();
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = ok; s.onerror = () => fallo(new Error('No pude cargar el acceso de Google. ¿Hay internet?'));
    document.head.appendChild(s);
  });
}

async function conectarGoogle() {
  if (!S.clientId) { avisar('Primero pega tu ID de cliente de Google en Ajustes.'); ir('ajustes'); return; }
  try { await cargarGIS(); } catch (e) { avisar(e.message); return; }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: S.clientId, scope: SCOPES,
    callback: r => {
      if (r.error) { avisar('Google no autorizó: ' + r.error); return; }
      token = r.access_token; tokenExp = Date.now() + (r.expires_in - 60) * 1000;
      try { sessionStorage.setItem('agenda.token', JSON.stringify({ v: token, exp: tokenExp })); } catch (e) { /* ok */ }
      gEventosCache = null; pintarGoogle(); avisar('Google conectado.'); render();
    },
    error_callback: e => avisar('No se pudo abrir el acceso de Google (' + (e.type || 'error') + ').'),
  });
  tokenClient.requestAccessToken({ prompt: token ? '' : 'consent' });
}

function desconectarGoogle() {
  if (token && window.google) google.accounts.oauth2.revoke(token, () => {});
  token = null; tokenExp = 0; gEventosCache = null; sessionStorage.removeItem('agenda.token'); pintarGoogle(); render();
}

function pintarGoogle() {
  const b = $('#btnGoogle');
  b.textContent = conectado() ? 'Google ✓' : 'Conectar Google';
  b.classList.toggle('on', conectado());
}

async function g(url, opciones = {}) {
  if (!conectado()) throw new Error('Conecta Google primero.');
  const r = await fetch(url, { ...opciones, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(opciones.headers || {}) } });
  if (r.status === 401) { token = null; pintarGoogle(); throw new Error('Se venció la conexión con Google. Toca "Conectar Google".'); }
  if (!r.ok) { let m = r.status; try { m = (await r.json()).error.message; } catch (e) { /* sin detalle */ } throw new Error('Google dijo: ' + m); }
  return r.status === 204 ? null : r.json();
}

async function eventosGoogle(desde, hasta) {
  if (!conectado()) return [];
  const clave = ymd(desde) + ymd(hasta);
  if (gEventosCache && gEventosCache.clave === clave && Date.now() - gEventosCache.t < 60000) return gEventosCache.lista;
  const q = new URLSearchParams({ timeMin: desde.toISOString(), timeMax: hasta.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
  try {
    const j = await g('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + q);
    const lista = (j.items || []).filter(e => e.status !== 'cancelled').map(e => {
      const todo = !!e.start.date;
      const ini = todo ? parseYmd(e.start.date) : new Date(e.start.dateTime);
      return { id: e.id, origen: 'google', titulo: e.summary || '(sin título)', fecha: ymd(ini), hora: todo ? '' : `${pad(ini.getHours())}:${pad(ini.getMinutes())}`,
        tipo: 'google', notas: e.location || '', propia: e.extendedProperties && e.extendedProperties.private && e.extendedProperties.private.app, base: e.recurringEventId || e.id };
    });
    gEventosCache = { clave, t: Date.now(), lista };
    return lista;
  } catch (e) { avisar(e.message); return []; }
}

async function crearEnGoogle(ev) {
  const cuerpo = { summary: ev.titulo, description: ev.notas || '', extendedProperties: { private: { app: 'agenda', ...(ev.taxKey ? { taxKey: ev.taxKey } : {}) } } };
  if (ev.hora) {
    const ini = new Date(`${ev.fecha}T${ev.hora}`); const fin = new Date(ini.getTime() + 3600000);
    cuerpo.start = { dateTime: ini.toISOString() }; cuerpo.end = { dateTime: fin.toISOString() };
    cuerpo.start.timeZone = cuerpo.end.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } else {
    cuerpo.start = { date: ev.fecha }; cuerpo.end = { date: ymd(sumaDias(parseYmd(ev.fecha), 1)) };
  }
  const regla = { anual: 'YEARLY', mensual: 'MONTHLY', semanal: 'WEEKLY' }[ev.repite];
  if (regla) cuerpo.recurrence = ['RRULE:FREQ=' + regla];
  const minutos = (ev.avisos || [ev.aviso ?? 30]).map(Number);
  cuerpo.reminders = { useDefault: false, overrides: minutos.map(m => ({ method: 'popup', minutes: m })) };
  const r = await g('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', body: JSON.stringify(cuerpo) });
  return r.id;
}

async function borrarEnGoogle(id) { if (conectado() && id) { try { await g('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(id), { method: 'DELETE' }); } catch (e) { /* ya no existe */ } } }

/* ---------- eventos: ocurrencias ---------- */
function ocurrenciasLocales(desde, hasta) {
  const out = [];
  for (const e of S.eventos) {
    const base = parseYmd(e.fecha);
    for (let d = inicioDia(desde); d < hasta; d = sumaDias(d, 1)) {
      let cae = false;
      if (e.repite === 'no' || !e.repite) cae = ymd(d) === e.fecha;
      else if (d >= base) {
        if (e.repite === 'anual') cae = d.getMonth() === base.getMonth() && d.getDate() === base.getDate();
        else if (e.repite === 'mensual') cae = d.getDate() === base.getDate();
        else if (e.repite === 'semanal') cae = d.getDay() === base.getDay();
      }
      if (cae) out.push({ ...e, origen: 'local', fechaOcurrencia: ymd(d) });
    }
  }
  return out;
}

async function agendaEntre(desde, hasta) {
  const locales = ocurrenciasLocales(desde, hasta).map(e => ({ ...e, fecha: e.fechaOcurrencia }));
  const mios = new Set(S.eventos.map(e => e.gId).filter(Boolean));
  const deG = (await eventosGoogle(desde, hasta)).filter(e => !(mios.has(e.id) || mios.has(e.base) || e.propia === 'agenda'));
  const imp = impuestosEntre(desde, hasta).map(t => ({ id: 'tax-' + t.key, origen: 'dgii', titulo: `${t.ob.form} · ${t.ob.nombre}`, fecha: ymd(t.due), hora: '', tipo: 'dgii', notas: t.periodo, taxKey: t.key, hecho: !!S.taxHecho[t.key] }));
  return [...locales, ...deG, ...imp].sort((a, b) => (a.fecha + (a.hora || '00:00')).localeCompare(b.fecha + (b.hora || '00:00')));
}

/* ---------- DGII ---------- */
function ajusteHabil(d) { const x = new Date(d); while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1); return x; }

function impuestosEntre(desde, hasta) {
  const out = [];
  for (let y = desde.getFullYear() - 1; y <= hasta.getFullYear() + 1; y++) {
    for (const ob of OBLIGACIONES) {
      if (S.taxOff[ob.id] === undefined ? !ob.activa : S.taxOff[ob.id]) continue;
      if (ob.tipo === 'anual') {
        const due = ajusteHabil(new Date(y, ob.mes - 1, ob.dia));
        if (due >= inicioDia(desde) && due < hasta) out.push({ ob, due, periodo: `Año ${y - 1}`, key: `${ob.id}|${y - 1}` });
      } else {
        for (let m = 0; m < 12; m++) {
          const due = ajusteHabil(new Date(y, m, ob.dia));
          if (due >= inicioDia(desde) && due < hasta) {
            const per = new Date(y, m - 1, 1);
            out.push({ ob, due, periodo: `${MESES[per.getMonth()]} ${per.getFullYear()}`, key: `${ob.id}|${per.getFullYear()}-${pad(per.getMonth() + 1)}` });
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.due - b.due);
}

const diasHasta = f => Math.round((inicioDia(f) - inicioDia(new Date())) / 86400000);
const textoQuedan = n => n < 0 ? `venció hace ${-n} d` : n === 0 ? 'HOY' : n === 1 ? 'mañana' : `en ${n} días`;
const claseQuedan = n => n <= 1 ? 'urgente' : n <= 5 ? 'pronto' : '';

/* ---------- efemérides ---------- */
async function efemerides(fecha) {
  const clave = `efe2.${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
  try { const c = JSON.parse(localStorage.getItem(clave) || 'null'); if (c) return c; } catch (e) { /* sin caché */ }
  const r = await fetch(`https://es.wikipedia.org/api/rest_v1/feed/onthisday/all/${pad(fecha.getMonth() + 1)}/${pad(fecha.getDate())}`);
  if (!r.ok) throw new Error('Wikipedia no respondió');
  const j = await r.json();
  const tomar = (lista, n) => (lista || []).filter(x => x.text && x.year != null).sort((a, b) => a.year - b.year)
    .filter((_, i, arr) => arr.length <= n || i % Math.ceil(arr.length / n) === 0).slice(0, n)
    .map(x => ({ year: x.year < 0 ? `${-x.year} a. C.` : x.year, text: x.text }));
  const datos = { eventos: tomar(j.events, 10), nacimientos: tomar(j.births, 6), muertes: tomar(j.deaths, 4), feriados: (j.holidays || []).slice(0, 4).map(h => h.text) };
  try { localStorage.setItem(clave, JSON.stringify(datos)); } catch (e) { /* lleno */ }
  return datos;
}

/* ---------- vistas ---------- */
let vista = 'hoy', mesAgenda = new Date(), fechaEfe = new Date();
const V = $('#vista');

function ir(v) {
  vista = v; location.hash = v;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  render();
}

function tarjetaEvento(e, conBoton = true) {
  const dgii = e.origen === 'dgii';
  const q = dgii ? diasHasta(parseYmd(e.fecha)) : null;
  return `<div class="card item ${e.hecho ? 'hecho' : ''}" ${e.origen === 'local' ? `data-edit="${e.id}"` : ''}>
    <div class="hora">${dgii ? 'DGII' : esc(hora12(e.hora))}</div>
    <div style="flex:1"><b>${esc(e.titulo)}</b>
      <small><span class="tag ${esc(e.tipo)}">${esc(e.tipo === 'google' ? 'Google' : e.tipo === 'dgii' ? 'DGII' : TIPOS[e.tipo] || e.tipo)}</span>${dgii ? esc('Período: ' + e.notas) + (e.hecho ? ' · hecho ✓' : ' · ' + textoQuedan(q)) : esc(e.notas || '')}</small></div>
    ${dgii && conBoton && !e.hecho ? `<button class="mini sec" data-tax="${esc(e.taxKey)}">Hecho</button>` : ''}
  </div>`;
}

/* ---------- semana (pantalla principal) ---------- */
const COLORES_DIA = ['var(--c-dom)', 'var(--c-lun)', 'var(--c-mar)', 'var(--c-mie)', 'var(--c-jue)', 'var(--c-vie)', 'var(--c-sab)'];   // por getDay()
const ABR_DIA = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const FRASE_DIA = ['Descansar también es avanzar.', 'La disciplina de hoy construye el éxito de mañana.', 'Cada paso cuenta.', 'La constancia también es parte del talento.', 'Cuida tu salud, también es productividad.', 'Un buen cierre abre la puerta a nuevas oportunidades.', 'Disfruta el ahora, también es parte del plan.'];
const COLORES_REC = ['#E5484D', '#3B82F6', '#22A06B', '#F5A524', '#7C4DFF', '#14B8A6'];
const COLORES_NOTA = ['#2F6FD0', '#3E9B4E', '#D9344A', '#6C42A8', '#1FA3A8'];
let semanaOff = 0;
const lunesDe = d => { const x = inicioDia(d); return sumaDias(x, -((x.getDay() + 6) % 7)); };
const semanaISO = d => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7); };
const claveCheck = e => e.origen === 'dgii' ? 'tax:' + e.taxKey : `ev:${e.id}|${e.fecha}`;
const estaHecho = e => e.origen === 'dgii' ? !!S.taxHecho[e.taxKey] : !!S.hechos[`${e.id}|${e.fecha}`];
const textoItem = e => esc(e.titulo) + (e.hora ? ` <small>(${esc(hora12(e.hora))})</small>` : '') + (e.origen === 'dgii' ? ' <span class="etq dgii">DGII</span>' : e.origen === 'google' ? ' <span class="etq google">Google</span>' : '');

function editarTexto(titulo, ayuda, valor, cb) {
  $('#txtTitulo').textContent = titulo; $('#txtAyuda').textContent = ayuda; $('#formTexto').texto.value = valor;
  editarTexto.cb = cb; $('#dlgTexto').showModal();
}
$('#dlgTexto').addEventListener('close', () => {
  const d = $('#dlgTexto'), r = d.returnValue; d.returnValue = '';
  if (r === 'ok' && editarTexto.cb) editarTexto.cb($('#formTexto').texto.value);
  editarTexto.cb = null;
});

function apuntesHtml() {
  const secs = []; let cur = null;
  for (const l of (S.apuntes || '').split('\n')) {
    const t = l.trim(); if (!t) continue;
    if (t.startsWith('#')) { cur = { t: t.replace(/^#+\s*/, ''), l: [] }; secs.push(cur); } else { if (!cur) { cur = { t: 'Notas', l: [] }; secs.push(cur); } cur.l.push(t.replace(/^[-•*]\s*/, '')); }
  }
  return secs.length ? secs.map((s, i) => `<div class="apunte"><h4 style="color:${COLORES_NOTA[i % COLORES_NOTA.length]}">● ${esc(s.t)}</h4><ul>${s.l.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')
    : '<p class="vacio">Escribe aquí ideas, datos y planes. Toca "Editar".</p>';
}

async function vistaSemana() {
  const lun = sumaDias(lunesDe(new Date()), semanaOff * 7), dom = sumaDias(lun, 6), fin = sumaDias(lun, 7), hoyS = ymd(new Date());
  const rango = lun.getMonth() === dom.getMonth() ? `Del ${lun.getDate()} al ${dom.getDate()} de ${MESES[dom.getMonth()]} de ${dom.getFullYear()}` : `Del ${lun.getDate()} de ${MESES[lun.getMonth()]} al ${dom.getDate()} de ${MESES[dom.getMonth()]} de ${dom.getFullYear()}`;
  $('#titulo').textContent = rango;
  $('#subtitulo').textContent = semanaOff === 0 ? 'Esta semana' : semanaOff === 1 ? 'Semana próxima' : semanaOff === -1 ? 'Semana pasada' : '';
  const pill = $('#pill'); pill.hidden = false; pill.textContent = 'Semana ' + semanaISO(lun);
  const nav = `<div class="grupo"><button class="mini sec" data-sem="-1">‹ Anterior</button><button class="mini sec" data-sem="0">Esta semana</button><button class="mini sec" data-sem="1">Siguiente ›</button></div>`;
  V.innerHTML = nav + '<p class="vacio">Cargando…</p>';
  const todos = await agendaEntre(lun, fin);
  if (vista !== 'hoy') return;

  let dias = '';
  for (let i = 0; i < 7; i++) {
    const d = sumaDias(lun, i), f = ymd(d), g = d.getDay();
    const items = todos.filter(e => e.fecha === f);
    dias += `<div class="dia-fila ${f === hoyS ? 'hoy' : ''}"><div class="dia-pil" style="background:${COLORES_DIA[g]}"><b>${ABR_DIA[g]}</b><strong>${d.getDate()}</strong><span>${MESES[d.getMonth()].slice(0, 3)[0].toUpperCase() + MESES[d.getMonth()].slice(1, 3)}</span></div>
      <div class="dia-cuerpo"><div>${items.length ? items.map(e => `<label class="tarea ${estaHecho(e) ? 'hecha' : ''}"><input type="checkbox" data-chk="${esc(claveCheck(e))}" ${estaHecho(e) ? 'checked' : ''}><span class="tx" ${e.origen === 'local' ? `data-edit="${esc(e.id)}"` : ''}>${textoItem(e)}</span></label>`).join('') : '<div class="vacio-dia">Sin pendientes</div>'}<button class="mas-b" data-add="${f}">+ Agregar</button></div>
      <div class="dia-frase">${esc(FRASE_DIA[g])}</div></div></div>`;
  }

  // Recordatorios: recordatorios y fechas importantes de la semana + vencimientos DGII (y los vencidos sin marcar)
  let recs = todos.filter(e => e.origen === 'dgii' || (e.origen === 'local' && (e.tipo === 'recordatorio' || e.tipo === 'fecha')));
  if (semanaOff === 0) recs = impuestosEntre(sumaDias(lun, -20), lun).filter(t => !S.taxHecho[t.key]).map(t => ({ id: 'tax-' + t.key, origen: 'dgii', titulo: `${t.ob.form} · ${t.ob.nombre}`, fecha: ymd(t.due), hora: '', notas: 'Vencido · período ' + t.periodo, taxKey: t.key })).concat(recs);
  const vistos = new Set(); recs = recs.filter(e => { if (e.origen === 'local' && e.repite === 'semanal') { if (vistos.has(e.id)) return false; vistos.add(e.id); } return true; });
  const recHtml = recs.length ? recs.map((e, i) => { const d = parseYmd(e.fecha); const cuando = e.repite === 'semanal' ? 'Toda la semana' : `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)[0].toUpperCase() + MESES[d.getMonth()].slice(1, 3)}`; const h = estaHecho(e);
    return `<div class="rec ${h ? 'hecha' : ''}"><span class="barra-c" style="background:${COLORES_REC[i % COLORES_REC.length]}"></span><div><b ${e.origen === 'local' ? `data-edit="${esc(e.id)}" style="cursor:pointer"` : ''}>${esc(e.titulo)}</b><small>${esc(e.origen === 'dgii' ? (e.notas || 'Vencimiento DGII') : e.notas || TIPOS[e.tipo])}</small></div><span class="cuando">${cuando}</span><input type="checkbox" data-chk="${esc(claveCheck(e))}" ${h ? 'checked' : ''}></div>`; }).join('')
    : '<p class="vacio">Sin recordatorios esta semana.</p>';

  const metas = (S.metas[ymd(lun)] || '').split('\n').map(x => x.trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
  V.innerHTML = nav + `<div class="semana"><div class="dias">${dias}</div>
    <div>
      <div class="panel"><div class="panel-t"><div><h3>🔔 Recordatorios</h3><small>NO LO OLVIDES</small></div><div class="rango">${lun.getDate()} – ${dom.getDate()}<br>${MESES[dom.getMonth()].slice(0, 3)[0].toUpperCase() + MESES[dom.getMonth()].slice(1, 3)} ${dom.getFullYear()}</div></div>${recHtml}${recs.some(e => e.notas && e.notas.startsWith('Vencido')) ? '<button class="mini sec" id="todoHecho">Marcar vencidos como hechos</button>' : ''}</div>
      <div class="panel"><div class="panel-t"><div><h3>📒 Apuntes importantes</h3><small>IDEAS · DATOS · PLANES</small></div><button class="mini sec" id="editApuntes">Editar</button></div>${apuntesHtml()}</div>
      <div class="panel efe" id="efeHoy"><div class="panel-t"><div><h3>📅 Un día como hoy</h3></div></div><p class="nota">Cargando…</p></div>
    </div></div>
    <div class="pie-metas"><div><b>🎯 Metas de la semana:</b>${metas.length ? `<ul>${metas.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '<div class="nota" style="color:#B9CDE6">Aún no tienes metas esta semana.</div>'}<button class="mini sec" id="editMetas" style="margin-top:8px">Editar metas</button></div><div class="tupuedes">¡Tú puedes!</div></div>`;
  $('#editApuntes').onclick = () => editarTexto('Apuntes importantes', 'Una línea que empiece con # es un título; las demás son los puntos de esa sección.', S.apuntes || '# Mi primera sección\n- Un punto\n- Otro punto', t => { S.apuntes = t.trim(); guardar(); render(); });
  $('#editMetas').onclick = () => editarTexto('Metas de la semana', 'Una meta por línea.', S.metas[ymd(lun)] || '', t => { S.metas[ymd(lun)] = t.trim(); guardar(); render(); });

  const hoy = new Date(), clave = `${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`, loc = FECHAS_RD[clave];
  efemerides(hoy).then(d => { const el = $('#efeHoy'); if (!el) return; el.innerHTML = `<div class="panel-t"><div><h3>📅 Un día como hoy</h3></div></div>` + (loc ? `<p>🇩🇴 ${esc(loc)}</p>` : '') + d.eventos.slice(-3).reverse().map(x => `<p><b>${esc(x.year)}</b> · ${esc(x.text)}</p>`).join('') + `<p><button class="mini sec" data-vista="dias">Ver más</button></p>`; })
    .catch(() => { const el = $('#efeHoy'); if (el) el.innerHTML = `<div class="panel-t"><div><h3>📅 Un día como hoy</h3></div></div>` + (loc ? `<p>🇩🇴 ${esc(loc)}</p>` : '') + '<p class="nota">No pude traer las efemérides del mundo (¿sin internet?).</p>'; });
}

function agruparDias(lista) {
  let ult = '', html = '';
  for (const e of lista) {
    if (e.fecha !== ult) { ult = e.fecha; const d = parseYmd(e.fecha); html += `<div class="dia">${esc(nombreDia(d))} <span>· ${textoQuedan(diasHasta(d))}</span></div>`; }
    html += tarjetaEvento(e);
  }
  return html;
}

async function vistaAgenda() {
  const m = new Date(mesAgenda.getFullYear(), mesAgenda.getMonth(), 1);
  $('#titulo').textContent = 'Agenda';
  $('#subtitulo').textContent = `${MESES[m.getMonth()]} ${m.getFullYear()}`;
  V.innerHTML = '<div class="grupo"><button class="mini sec" id="mesAnt">‹ Anterior</button><button class="mini sec" id="mesHoy">Este mes</button><button class="mini sec" id="mesSig">Siguiente ›</button></div><p class="vacio">Cargando…</p>';
  const lista = await agendaEntre(m, new Date(m.getFullYear(), m.getMonth() + 1, 1));
  V.innerHTML = `<div class="grupo"><button class="mini sec" id="mesAnt">‹ Anterior</button><button class="mini sec" id="mesHoy">Este mes</button><button class="mini sec" id="mesSig">Siguiente ›</button></div>` +
    (lista.length ? agruparDias(lista) : '<p class="vacio">Nada programado este mes. Toca + para agregar.</p>');
  $('#mesAnt').onclick = () => { mesAgenda = new Date(m.getFullYear(), m.getMonth() - 1, 1); render(); };
  $('#mesSig').onclick = () => { mesAgenda = new Date(m.getFullYear(), m.getMonth() + 1, 1); render(); };
  $('#mesHoy').onclick = () => { mesAgenda = new Date(); render(); };
}

function vistaImpuestos() {
  $('#titulo').textContent = 'Impuestos DGII';
  $('#subtitulo').textContent = 'Presentación y pago';
  const hoy = inicioDia(new Date());
  const lista = impuestosEntre(sumaDias(hoy, -20), new Date(hoy.getFullYear(), hoy.getMonth() + 4, 1));
  V.innerHTML = `
    <p class="nota">Plazos generales. Si caen en fin de semana pasan al lunes, pero no considero feriados: confirma con tu contador o en dgii.gov.do.</p>
    <h2>Próximos vencimientos</h2>
    ${lista.map(t => { const q = diasHasta(t.due), h = S.taxHecho[t.key]; return `<div class="card venc ${h ? 'hecho' : ''}"><div><b>${esc(t.ob.form)} · ${esc(t.ob.nombre)}</b><br><small class="nota">${esc(nombreDia(t.due))} · período ${esc(t.periodo)}</small></div><div style="text-align:right"><span class="quedan ${h ? '' : claseQuedan(q)}">${h ? 'Hecho ✓' : textoQuedan(q)}</span><br><button class="mini sec" data-tax="${esc(t.key)}">${h ? 'Deshacer' : 'Hecho'}</button></div></div>`; }).join('') || '<p class="vacio">Sin vencimientos.</p>'}
    <div class="grupo"><button class="btn" id="taxGoogle">Poner los próximos 3 meses en Google Calendar</button></div>
    <h2>Qué obligaciones sigo</h2>
    ${OBLIGACIONES.map(o => { const on = S.taxOff[o.id] === undefined ? o.activa : !S.taxOff[o.id]; return `<label class="check card"><input type="checkbox" data-ob="${o.id}" ${on ? 'checked' : ''}> <span><b>${esc(o.form)}</b> · ${esc(o.nombre)}<br><small class="nota">${o.tipo === 'anual' ? `Cada ${o.dia} de ${MESES[o.mes - 1]}` : `Día ${o.dia} del mes siguiente`}</small></span></label>`; }).join('')}`;
}

async function taxAGoogle() {
  if (!conectado()) { avisar('Conecta Google primero.'); return; }
  const hoy = inicioDia(new Date());
  const pend = impuestosEntre(hoy, new Date(hoy.getFullYear(), hoy.getMonth() + 4, 1)).filter(t => !S.taxHecho[t.key]);
  try {
    const q = new URLSearchParams({ timeMin: hoy.toISOString(), timeMax: new Date(hoy.getFullYear() + 2, 0, 1).toISOString(), privateExtendedProperty: 'app=agenda', singleEvents: 'true', maxResults: '500' });
    const ya = new Set(((await g('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + q)).items || []).map(e => e.extendedProperties.private.taxKey).filter(Boolean));
    let n = 0;
    for (const t of pend) {
      if (ya.has(t.key)) continue;
      await crearEnGoogle({ titulo: `DGII · ${t.ob.form} ${t.ob.nombre}`, fecha: ymd(t.due), hora: '', repite: 'no', notas: `Período: ${t.periodo}. Plazo general; confirma en dgii.gov.do.`, taxKey: t.key, avisos: [3780, 900] });
      n++;
    }
    gEventosCache = null;
    avisar(n ? `Agregué ${n} vencimientos a Google Calendar.` : 'Ya estaban todos en Google Calendar.');
  } catch (e) { avisar(e.message); }
}

async function vistaDias() {
  $('#titulo').textContent = 'Efemérides';
  $('#subtitulo').textContent = 'Importantes y efemérides';
  const propias = S.eventos.filter(e => e.tipo === 'fecha').sort((a, b) => a.fecha.slice(5).localeCompare(b.fecha.slice(5)));
  const clave = `${pad(fechaEfe.getMonth() + 1)}-${pad(fechaEfe.getDate())}`;
  V.innerHTML = `
    <h2>Mis fechas importantes</h2>
    ${propias.length ? propias.map(e => { const d = parseYmd(e.fecha); return `<div class="card item" data-edit="${e.id}"><div class="hora">${pad(d.getDate())}/${pad(d.getMonth() + 1)}</div><div><b>${esc(e.titulo)}</b><small>${e.repite === 'anual' ? 'Cada año' : esc(nombreDia(d))}</small></div></div>`; }).join('') : '<p class="vacio">Agrega cumpleaños, aniversarios y vencimientos con +.</p>'}
    <h2>Un día como hoy</h2>
    <div class="card"><label>Fecha<input type="date" id="efeFecha" value="${ymd(fechaEfe)}"></label></div>
    <div id="efeCuerpo" class="card efe">${FECHAS_RD[clave] ? `<p>🇩🇴 ${esc(FECHAS_RD[clave])}</p>` : ''}<p class="nota">Cargando…</p></div>`;
  $('#efeFecha').onchange = e => { if (e.target.value) { fechaEfe = parseYmd(e.target.value); vistaDias(); } };
  try {
    const d = await efemerides(fechaEfe);
    const sec = (t, l, f) => l.length ? `<p><strong>${t}</strong></p>${l.map(f).join('')}` : '';
    $('#efeCuerpo').innerHTML = (FECHAS_RD[clave] ? `<p>🇩🇴 <strong>República Dominicana</strong></p><p>${esc(FECHAS_RD[clave])}</p>` : '') +
      sec('🌎 Sucedió en el mundo', d.eventos, x => `<p><b>${x.year}</b> · ${esc(x.text)}</p>`) +
      sec('🎂 Nacieron', d.nacimientos, x => `<p><b>${x.year}</b> · ${esc(x.text)}</p>`) +
      sec('🕯️ Fallecieron', d.muertes, x => `<p><b>${x.year}</b> · ${esc(x.text)}</p>`) +
      (d.feriados.length ? `<p class="nota">Se celebra: ${d.feriados.map(esc).join('; ')}</p>` : '') + '<p class="nota">Fuente: Wikipedia.</p>';
  } catch (e) { $('#efeCuerpo').innerHTML = (FECHAS_RD[clave] ? `<p>🇩🇴 ${esc(FECHAS_RD[clave])}</p>` : '') + '<p class="nota">No pude traer las efemérides del mundo (¿sin internet?).</p>'; }
}

let consultaCorreo = 'in:inbox newer_than:14d (factura OR vence OR vencimiento OR pago OR reunión OR cita OR recordatorio OR "fecha límite" OR DGII)';
async function vistaCorreos() {
  $('#titulo').textContent = 'Correos';
  $('#subtitulo').textContent = 'Gmail · solo lectura';
  if (!conectado()) { V.innerHTML = '<div class="card"><p>Conecta tu cuenta de Google para ver los correos que mencionan fechas, pagos o reuniones y convertirlos en recordatorios.</p><button class="btn" id="irG">Conectar Google</button></div>'; $('#irG').onclick = conectarGoogle; return; }
  V.innerHTML = `<div class="card"><label>Búsqueda en Gmail<input id="qCorreo" value="${esc(consultaCorreo)}"></label><div class="grupo"><button class="btn" id="buscarCorreo">Buscar</button></div></div><div id="listaCorreos"><p class="vacio">Buscando…</p></div>`;
  $('#buscarCorreo').onclick = () => { consultaCorreo = $('#qCorreo').value; vistaCorreos(); };
  try {
    const l = await g('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=' + encodeURIComponent(consultaCorreo));
    const msgs = await Promise.all((l.messages || []).map(m => g(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`)));
    const cab = (m, n) => ((m.payload.headers || []).find(h => h.name.toLowerCase() === n) || {}).value || '';
    $('#listaCorreos').innerHTML = msgs.length ? msgs.map(m => `<div class="card"><b>${esc(cab(m, 'subject') || '(sin asunto)')}</b><br><small class="nota">${esc(cab(m, 'from'))}</small><p class="nota" style="margin:6px 0">${esc(m.snippet || '')}</p><div class="grupo"><button class="mini" data-mail="${esc(m.id)}" data-asunto="${esc(cab(m, 'subject'))}">Crear recordatorio</button><a class="mini sec" style="text-decoration:none;color:inherit" target="_blank" rel="noopener" href="https://mail.google.com/mail/u/0/#inbox/${esc(m.id)}">Abrir</a></div></div>`).join('') : '<p class="vacio">No encontré correos con esa búsqueda.</p>';
  } catch (e) { $('#listaCorreos').innerHTML = `<p class="vacio">${esc(e.message)}</p>`; }
}

function vistaAjustes() {
  $('#titulo').textContent = 'Ajustes';
  $('#subtitulo').textContent = 'Google, avisos y respaldo';
  const perm = 'Notification' in window ? Notification.permission : 'no disponible';
  V.innerHTML = `<div class="ajuste">
    <h2>Google</h2>
    <div class="card"><label>ID de cliente de Google (OAuth)<input id="cid" value="${esc(S.clientId)}" placeholder="123456789-abc.apps.googleusercontent.com"></label>
      <p class="nota">Se crea una sola vez en Google Cloud (ver GUIA-GOOGLE.md). Sin esto la agenda funciona, pero sin Google Calendar ni Gmail.</p>
      <div class="grupo"><button class="btn" id="cidGuardar">Guardar</button>${conectado() ? '<button class="btn sec" id="gSalir">Desconectar</button>' : '<button class="btn sec" id="gEntrar">Conectar</button>'}</div></div>
    <h2>Avisos</h2>
    <div class="card"><p>Permiso de notificaciones: <b>${esc(perm)}</b></p>
      <div class="grupo"><button class="btn" id="permNotif">Activar notificaciones</button></div>
      <p class="nota">La app avisa solo cuando está abierta o en segundo plano reciente. Para que el celular te avise SIEMPRE, guarda los eventos también en Google Calendar (casilla del formulario): la app de Google Calendar los notifica aunque esta app esté cerrada.</p></div>
    <h2>Respaldo</h2>
    <div class="card"><div class="grupo"><button class="btn sec" id="exp">Descargar respaldo</button><label class="mini sec" style="display:inline-block">Restaurar<input type="file" id="imp" accept="application/json" hidden></label></div>
      <p class="nota">Tus datos están en este dispositivo. Descarga un respaldo de vez en cuando.</p></div>
  </div>`;
  $('#cidGuardar').onclick = () => { S.clientId = $('#cid').value.trim(); guardar(); avisar('ID guardado.'); };
  const ge = $('#gEntrar'); if (ge) ge.onclick = () => { S.clientId = $('#cid').value.trim(); guardar(); conectarGoogle(); };
  const gs = $('#gSalir'); if (gs) gs.onclick = desconectarGoogle;
  $('#permNotif').onclick = async () => { if (!('Notification' in window)) return avisar('Este navegador no permite notificaciones.'); const r = await Notification.requestPermission(); avisar('Notificaciones: ' + r); vistaAjustes(); };
  $('#exp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' })); a.download = `mi-agenda-${ymd(new Date())}.json`; a.click(); };
  $('#imp').onchange = async e => { try { const j = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(j.eventos)) throw 0; S = Object.assign(S, j); guardar(); avisar('Respaldo restaurado.'); render(); } catch (x) { avisar('Ese archivo no es un respaldo válido.'); } };
}

function render() {
  pintarGoogle();
  $('#pill').hidden = vista !== 'hoy';
  ({ hoy: vistaSemana, agenda: vistaAgenda, impuestos: vistaImpuestos, dias: vistaDias, correos: vistaCorreos, ajustes: vistaAjustes }[vista] || vistaSemana)();
  $('#fab').hidden = vista === 'ajustes';
}

/* ---------- formulario ---------- */
const dlg = $('#dlg'), form = $('#form');
let editando = null;

function abrirForm(datos = {}, id = null) {
  editando = id;
  $('#dlgTitulo').textContent = id ? 'Editar' : 'Nuevo';
  form.reset();
  form.tipo.value = datos.tipo || 'cita'; form.titulo.value = datos.titulo || ''; form.fecha.value = datos.fecha || ymd(new Date());
  form.hora.value = datos.hora || ''; form.todoDia.checked = datos.id ? !datos.hora : false;
  form.aviso.value = String(datos.aviso ?? 30); form.repite.value = datos.repite || 'no'; form.notas.value = datos.notas || '';
  form.enGoogle.checked = datos.id ? !!datos.gId : conectado();
  form.enGoogle.disabled = !conectado() && !datos.gId;
  $('#btnBorrar')?.remove();
  if (id) { const b = document.createElement('button'); b.id = 'btnBorrar'; b.value = 'borrar'; b.className = 'sec'; b.textContent = 'Borrar'; b.style.color = 'var(--alerta)'; $('.botones', form).prepend(b); }
  dlg.showModal();
}

dlg.addEventListener('close', async () => {
  const r = dlg.returnValue; dlg.returnValue = '';
  if (r === 'borrar' && editando) {
    const e = S.eventos.find(x => x.id === editando); S.eventos = S.eventos.filter(x => x.id !== editando); guardar();
    if (e && e.gId) await borrarEnGoogle(e.gId);
    gEventosCache = null; avisar('Borrado.'); render(); return;
  }
  if (r !== 'ok') return;
  const f = form;
  if (!f.titulo.value.trim()) { avisar('Escribe un título.'); return; }
  const ev = { id: editando || uid(), tipo: f.tipo.value, titulo: f.titulo.value.trim(), fecha: f.fecha.value, hora: f.todoDia.checked ? '' : f.hora.value,
    aviso: Number(f.aviso.value), repite: f.repite.value, notas: f.notas.value.trim() };
  const previo = S.eventos.find(x => x.id === ev.id);
  if (previo && previo.gId) { ev.gId = previo.gId; await borrarEnGoogle(previo.gId); delete ev.gId; }
  if (f.enGoogle.checked && conectado()) { try { ev.gId = await crearEnGoogle(ev); } catch (e) { avisar(e.message + ' Se guardó solo en este dispositivo.'); } }
  S.eventos = S.eventos.filter(x => x.id !== ev.id).concat(ev); guardar(); gEventosCache = null;
  avisar(ev.gId ? 'Guardado y enviado a Google Calendar.' : 'Guardado.'); render();
});

/* ---------- avisos locales ---------- */
async function revisarAvisos() {
  const ahora = new Date(), hoy = inicioDia(ahora);
  const lanzar = (clave, titulo, cuerpo) => {
    if (S.disparados[clave]) return; S.disparados[clave] = Date.now(); guardar();
    avisar('🔔 ' + titulo);
    if ('Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker && navigator.serviceWorker.ready.then(r => r.showNotification(titulo, { body: cuerpo, icon: 'icons/icon-192.png', tag: clave })).catch(() => new Notification(titulo, { body: cuerpo }));
    }
  };
  for (const e of ocurrenciasLocales(hoy, sumaDias(hoy, 8))) {
    const f = e.fechaOcurrencia;
    const inicio = e.hora ? new Date(`${f}T${e.hora}`) : new Date(`${f}T09:00`);
    const disparo = new Date(inicio.getTime() - (e.aviso || 0) * 60000);
    if (ahora >= disparo && ahora < new Date(inicio.getTime() + 3600000)) lanzar(`${e.id}|${f}`, e.titulo, `${hora12(e.hora)} · ${TIPOS[e.tipo]}`);
  }
  for (const t of impuestosEntre(hoy, sumaDias(hoy, 5))) {
    if (S.taxHecho[t.key]) continue;
    const n = diasHasta(t.due);
    if ((n === 3 || n === 1 || n === 0) && ahora.getHours() >= 9) lanzar(`${t.key}|${n}`, `DGII ${t.ob.form}: ${textoQuedan(n)}`, `${t.ob.nombre} · ${t.periodo}`);
  }
  const corte = Date.now() - 40 * 86400000; let sucio = false;
  for (const k in S.disparados) if (S.disparados[k] < corte) { delete S.disparados[k]; sucio = true; }
  if (sucio) guardar();
}

/* ---------- eventos de la interfaz ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tax]');
  if (t) { e.stopPropagation(); const k = t.dataset.tax; if (S.taxHecho[k]) delete S.taxHecho[k]; else S.taxHecho[k] = Date.now(); guardar(); render(); return; }
  const m = e.target.closest('[data-mail]');
  if (m) { const man = new Date(); man.setDate(man.getDate() + 1); abrirForm({ tipo: 'recordatorio', titulo: m.dataset.asunto, fecha: ymd(man), hora: '', notas: 'Desde Gmail: https://mail.google.com/mail/u/0/#inbox/' + m.dataset.mail }); return; }
  const v = e.target.closest('[data-vista]'); if (v) { ir(v.dataset.vista); return; }
  const ed = e.target.closest('[data-edit]');
  if (ed) { const ev = S.eventos.find(x => x.id === ed.dataset.edit); if (ev) abrirForm(ev, ev.id); }
});
document.addEventListener('change', e => {
  const o = e.target.closest('[data-ob]');
  if (o) { S.taxOff[o.dataset.ob] = !o.checked; guardar(); }
  const c = e.target.closest('[data-chk]');
  if (c) {
    const [tipo, ...resto] = c.dataset.chk.split(':'), k = resto.join(':');
    const mapa = tipo === 'tax' ? S.taxHecho : S.hechos;
    if (c.checked) mapa[k] = Date.now(); else delete mapa[k];
    guardar(); render();
  }
});
document.addEventListener('click', e => {
  const s = e.target.closest('[data-sem]'); if (s) { semanaOff = s.dataset.sem === '0' ? 0 : semanaOff + Number(s.dataset.sem); render(); return; }
  const a = e.target.closest('[data-add]'); if (a) abrirForm({ fecha: a.dataset.add });
});
document.addEventListener('click', e => {
  if (e.target.id === 'taxGoogle') taxAGoogle();
  if (e.target.id === 'todoHecho') { const h = inicioDia(new Date()); impuestosEntre(sumaDias(h, -20), h).forEach(t => (S.taxHecho[t.key] = Date.now())); guardar(); render(); }
});
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) ir(b.dataset.v); });
$('#fab').addEventListener('click', () => abrirForm());
$('#btnGoogle').addEventListener('click', () => (conectado() ? ir('ajustes') : conectarGoogle()));

/* ---------- frase del día ---------- */
function frasDelDia() {
  const h = new Date(), n = Math.floor((Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()) - Date.UTC(h.getFullYear(), 0, 0)) / 86400000);
  const [txt, autor] = FRASES[n % FRASES.length];
  $('#fraseTop').innerHTML = `“${esc(txt)}”<small>— ${esc(autor)}</small>`;
}

/* ---------- arranque ---------- */
frasDelDia();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
vista = (location.hash || '#hoy').slice(1); if (!['hoy', 'agenda', 'impuestos', 'dias', 'correos', 'ajustes'].includes(vista)) vista = 'hoy';
document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === vista));
render();
setInterval(revisarAvisos, 30000); setTimeout(revisarAvisos, 2500);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { frasDelDia(); revisarAvisos(); if (vista === 'hoy') render(); } });
