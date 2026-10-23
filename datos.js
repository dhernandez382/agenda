/* Datos fijos de la agenda. Edita aquí si cambian las reglas. */

/* Obligaciones DGII. tipo "mensual": vence el día `dia` del mes siguiente al período.
   tipo "anual": vence en `mes`/`dia` de cada año (mes 1-12). Si cae en sábado o domingo se pasa al lunes.
   `activa` = viene encendida por defecto (puedes cambiarla en la pestaña DGII).
   IMPORTANTE: son plazos generales. Los feriados y las normas generales de la DGII pueden moverlos;
   confirma con tu contador o en dgii.gov.do antes de depender de una fecha. */
const OBLIGACIONES = [
  { id: 'ir3',   form: 'IR-3',  nombre: 'Retenciones a asalariados',        tipo: 'mensual', dia: 10, activa: true },
  { id: 'ir17',  form: 'IR-17', nombre: 'Otras retenciones y retribuciones', tipo: 'mensual', dia: 10, activa: true },
  { id: 'f606',  form: '606',   nombre: 'Envío de compras y gastos',         tipo: 'mensual', dia: 15, activa: true },
  { id: 'f607',  form: '607',   nombre: 'Envío de ventas',                   tipo: 'mensual', dia: 15, activa: true },
  { id: 'anti',  form: 'Anticipo', nombre: 'Anticipo del ISR (si aplica)',   tipo: 'mensual', dia: 15, activa: true },
  { id: 'it1',   form: 'IT-1',  nombre: 'ITBIS: declaración y pago',         tipo: 'mensual', dia: 20, activa: true },
  { id: 'ir2',   form: 'IR-2',  nombre: 'Declaración jurada anual de sociedades (cierre 31 de diciembre)', tipo: 'anual', mes: 4, dia: 30, activa: true },
  { id: 'ir1',   form: 'IR-1',  nombre: 'Declaración jurada anual de personas físicas', tipo: 'anual', mes: 3, dia: 31, activa: false },
];

/* Fechas patrias y dominicanas fijas (mes-día). */
const FECHAS_RD = {
  '01-01': 'Año Nuevo.',
  '01-06': 'Día de los Santos Reyes.',
  '01-21': 'Día de Nuestra Señora de la Altagracia, protectora del pueblo dominicano.',
  '01-26': 'Natalicio de Juan Pablo Duarte (1813), Padre de la Patria.',
  '02-27': 'Día de la Independencia Nacional: en 1844 Francisco del Rosario Sánchez proclamó la separación de Haití.',
  '03-19': 'Batalla del 19 de Marzo (1844), en Azua.',
  '03-30': 'Batalla del 30 de Marzo (1844), en Santiago.',
  '04-24': 'Revolución de Abril de 1965 (inicio).',
  '05-01': 'Día Internacional del Trabajo.',
  '05-30': 'Muerte de Rafael Leónidas Trujillo (1961).',
  '06-04': 'Fiesta de Corpus Christi (fecha movible).',
  '08-16': 'Día de la Restauración (1863): inicio de la guerra que restauró la República.',
  '09-24': 'Día de Nuestra Señora de las Mercedes, patrona de la República.',
  '11-06': 'Día de la Constitución: se proclamó la primera Constitución dominicana en San Cristóbal (1844).',
  '12-25': 'Navidad.',
};

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

/* Frase motivadora del día: una distinta cada día (se repite al terminar la lista). [texto, autor]
   Algunas son atribuciones populares; si quieres cambiar o agregar, edita esta lista. */
const FRASES = [
  ['La disciplina es el puente entre las metas y los logros.', 'Jim Rohn'],
  ['No cuentes los días, haz que los días cuenten.', 'Muhammad Ali'],
  ['Empieza donde estás. Usa lo que tienes. Haz lo que puedas.', 'Arthur Ashe'],
  ['El único modo de hacer un gran trabajo es amar lo que haces.', 'Steve Jobs'],
  ['Somos lo que hacemos repetidamente. La excelencia no es un acto, es un hábito.', 'Will Durant'],
  ['El que tiene un porqué para vivir puede soportar casi cualquier cómo.', 'Friedrich Nietzsche'],
  ['Lo que haces hoy puede mejorar todos tus mañanas.', 'Ralph Marston'],
  ['Tu tiempo es limitado, no lo malgastes viviendo la vida de otro.', 'Steve Jobs'],
  ['Un viaje de mil millas comienza con un solo paso.', 'Lao-Tsé'],
  ['Nada en este mundo puede reemplazar a la persistencia.', 'Calvin Coolidge'],
  ['El fracaso es la oportunidad de comenzar de nuevo, esta vez con más inteligencia.', 'Henry Ford'],
  ['Haz de cada día tu obra maestra.', 'John Wooden'],
  ['Sed justos lo primero, si queréis ser felices.', 'Juan Pablo Duarte'],
  ['Siempre parece imposible hasta que se hace.', 'Nelson Mandela'],
  ['No importa lo lento que vayas, siempre y cuando no te detengas.', 'Confucio'],
  ['No es que tengamos poco tiempo, sino que perdemos mucho.', 'Séneca'],
  ['Haz lo que puedas, con lo que tengas, donde estés.', 'Theodore Roosevelt'],
  ['Un objetivo sin un plan es solo un deseo.', 'Antoine de Saint-Exupéry'],
  ['La excelencia no es una destreza, es una actitud.', 'Ralph Marston'],
  ['Una inversión en conocimiento siempre paga el mejor interés.', 'Benjamin Franklin'],
  ['Quien quiere hacer algo encuentra un medio; quien no, una excusa.', 'Proverbio árabe'],
  ['Podrán cortar todas las flores, pero no podrán detener la primavera.', 'Pablo Neruda'],
  ['Pies, ¿para qué los quiero si tengo alas para volar?', 'Frida Kahlo'],
  ['El éxito suele llegar a quienes están demasiado ocupados para buscarlo.', 'Henry David Thoreau'],
  ['La felicidad de tu vida depende de la calidad de tus pensamientos.', 'Marco Aurelio'],
  ['Cree que puedes y ya estarás a medio camino.', 'Theodore Roosevelt'],
  ['Vivir sin patria es lo mismo que vivir sin honor.', 'Juan Pablo Duarte'],
  ['No esperes. El momento perfecto nunca llegará.', 'Napoleon Hill'],
  ['Lo que no te desafía, no te cambia.', 'Fred DeVito'],
  ['El que madruga, Dios lo ayuda.', 'Refrán popular'],
  ['La acción es la clave fundamental de todo éxito.', 'Pablo Picasso'],
  ['Sé el cambio que quieres ver en el mundo.', 'Mahatma Gandhi'],
  ['Lo esencial es invisible a los ojos.', 'Antoine de Saint-Exupéry'],
  ['La educación es el arma más poderosa para cambiar el mundo.', 'Nelson Mandela'],
];