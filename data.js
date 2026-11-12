/* Pisa — datos del local y carta.
   Fuente: menú oficial (PDF "Menú enero 2025" del Linktree), Instagram @pisa.ar y Google Maps.
   Los precios hay que confirmarlos con el local antes de publicar. */

const PISA = {
  name: 'Pisa',
  tagline: 'con S, claramente',
  claim: 'La vera pisa en la ciudad de Córdoba',
  address: 'Lima 917, B° General Paz, Córdoba',
  hours: 'Martes a domingo · desde las 20 h',
  phone: '0351 757-6294',
  whatsapp: 'https://api.whatsapp.com/send?phone=5493517576294',
  instagram: 'https://www.instagram.com/pisa.ar/',
  maps: 'https://www.google.com/maps/search/?api=1&query=Pisa+Lima+917+C%C3%B3rdoba',
  reviewsUrl: 'https://www.google.com/maps?cid=11564504418086399121', // ficha de Pisa en Google Maps
  rating: 4.3,
  reviews: 309,
  tables: 12,
};

const CATS = [
  { id: 'entradas',    name: 'Entradas',     sub: 'Para ir abriendo el apetito' },
  { id: 'napoletanas', name: 'Napoletanas',  sub: '48 h de fermentación, estiradas en el momento' },
  { id: 'portenas',    name: 'Porteñas',     sub: 'Al molde, con medio kilo de mozzarella · pueden ser mitad y mitad' },
  { id: 'rellenas',    name: 'Rellenas',     sub: '8 porciones de pura fugazzeta' },
  { id: 'entrepanes',  name: 'Entre panes',  sub: 'Salen con papas fritas y cazuela de alioli' },
  { id: 'otras',       name: 'Otras opciones', sub: 'Panchukes al horno de barro y algo verde' },
  { id: 'sinalcohol',  name: 'Sin alcohol',  sub: 'Bien frías' },
  { id: 'conalcohol',  name: 'Con alcohol',  sub: 'Una pisa y una pinta lo solucionan todo' },
];

// Extras que el cliente puede sumar a un producto. price: 0 = "precio a confirmar" (lo define el local).
const EXTRAS = [
  { id: 'muzza', name: 'Mozzarella extra', price: 0 },
  { id: 'jamon', name: 'Jamón cocido', price: 0 },
  { id: 'crudo', name: 'Jamón crudo', price: 0 },
  { id: 'azul', name: 'Queso azul', price: 0 },
  { id: 'rucula', name: 'Rúcula', price: 0 },
  { id: 'hongos', name: 'Hongos', price: 0 },
  { id: 'pepperoni', name: 'Pepperoni', price: 0 },
  { id: 'huevo', name: 'Huevo', price: 0 },
];
// Categorías donde se pueden quitar ingredientes / sumar extras (las bebidas no).
const CUSTOM_CATS = ['entradas', 'napoletanas', 'portenas', 'rellenas', 'entrepanes', 'otras'];

const I = (id, cat, name, desc, price, extra = {}) => ({ id, cat, name, desc, price, available: true, ...extra });
const img = n => `img/${n}.jpg`;

const ITEMS = [
  // Entradas
  I('e-provoleta', 'entradas', 'Provoleta', 'Con champis o tomates confitados, envuelta en masa napoletana.', 13000, { ing: [] }),
  I('e-papas1', 'entradas', 'Papas 1', 'Papas fritas con cheddar, chips de jamón crudo y cebollita de verdeo.', 11000, { img: img('papas1') , ing: ['Cheddar', 'Chips de jamón crudo', 'Cebollita de verdeo'] }),
  I('e-papas2', 'entradas', 'Papas 2', 'Papas fritas con alioli de la casa, huevo a la plancha y pesto.', 11000, { img: img('papas2'), veg: true , ing: ['Alioli', 'Huevo a la plancha', 'Pesto'] }),
  I('e-faina', 'entradas', 'Fainá', 'La porción. De jueves a domingo.', 3000, { img: img('faina'), veg: true , ing: [] }),
  I('e-pisita', 'entradas', 'Pisita', 'Chalitas de masa de pisa con dips de sriracha, alioli y cheddar.', 10000, { ing: ['Sriracha', 'Alioli', 'Cheddar'] }),

  // Napoletanas (entera / individual)
  I('n-muzza', 'napoletanas', 'Muzza clásica', 'Salsa de tomate, mozzarella, orégano, pesto.', 18000, { ind: 10000, veg: true, img: img('muzza') }),
  I('n-doble', 'napoletanas', 'Doble muzza', 'Salsa de tomate, doble ración de mozzarella, orégano, pesto.', 21000, { ind: 13000, veg: true, img: img('doblemuzza') }),
  I('n-fugazzeta', 'napoletanas', 'Fugazzeta', 'Salsa de tomate, mozzarella, mix de cebolla blanca y morada, orégano, pesto.', 22000, { ind: 13000, veg: true, img: img('fugazzeta') }),
  I('n-fuga-azul', 'napoletanas', 'Fugazzeta y queso azul', 'Salsa de tomate, mozzarella, mix de cebolla blanca y morada, queso azul, orégano.', 24000, { ind: 15000, veg: true, img: img('fugazza') }),
  I('n-azul', 'napoletanas', 'Queso azul', 'Salsa de tomate, mozzarella, queso azul, nueces, azúcar mascabo.', 24500, { ind: 16000, veg: true }),
  I('n-hongos', 'napoletanas', 'Hongos frescos', 'Salsa de tomate, mozzarella, mix de champiñones y portobellos frescos, almendras tostadas y pesto.', 26000, { ind: 16500, veg: true, img: img('hongos'), hot: true }),
  I('n-napo', 'napoletanas', 'Napo', 'Salsa de tomate, mozzarella, tomates, hebras de queso reggianito, orégano y pesto.', 21500, { ind: 13500, veg: true, img: img('napo') }),
  I('n-napo-jamon', 'napoletanas', 'Napo con jamón', 'Salsa de tomate, mozzarella, tomates, jamón cocido, orégano y pesto.', 23000, { ind: 14000 }),
  I('n-rucula', 'napoletanas', 'Rúcula y jamón', 'Salsa de tomate, mozzarella, jamón crudo, rúcula, tomate cherry, pesto.', 26000, { ind: 16500, img: img('rucula'), hot: true }),
  I('n-especial', 'napoletanas', 'Especial', 'Salsa de tomate, mozzarella, jamón, tiras de pimiento rojo.', 23000, { ind: 14000, img: img('especial') }),
  I('n-palmitos', 'napoletanas', 'Palmitos', 'Salsa de tomate, mozzarella, jamón, palmitos, salsa golf.', 27000, { ind: 17000 }),
  I('n-4quesos', 'napoletanas', 'Cuatro quesos', 'Salsa de tomate, mozzarella, cuartirolo, provolone, queso azul, pesto.', 24000, { ind: 15000, veg: true, img: img('cuatroquesos') }),
  I('n-peras', 'napoletanas', 'Peras y queso azul', 'Salsa de tomate, mozzarella, peras, queso azul, azúcar negra.', 27000, { ind: 18000, veg: true }),
  I('n-mortadela', 'napoletanas', 'Mortadela con pistachos', 'Salsa de tomate, mozzarella, mortadela con pistachos, pistachos y pesto.', 25000, { ind: 15500 }),
  I('n-veggie', 'napoletanas', 'Full veggie', 'Salsa de tomate, mozzarella vegana, mix de verduras asadas y hongos, pesto.', 24000, { ind: 16000, veg: true }),
  I('n-bianca', 'napoletanas', 'Bianca', 'Mozzarella, zucchini, miel y nueces.', 24000, { ind: 13000, veg: true, img: img('hongos-bianca') }),
  I('n-pepperoni', 'napoletanas', 'Pepperoni', 'Salsa de tomate, mozzarella, fetas de pepperoni y orégano.', 28000, { ind: 18000, img: img('pepperoni'), hot: true }),

  // Porteñas (al molde)
  I('p-muzza', 'portenas', 'Muzza clásica', 'Salsa de tomate, mozzarella, orégano, pesto.', 20000, { veg: true, img: img('doblemuzza') }),
  I('p-fugazza', 'portenas', 'Fugazza', 'Salsa de tomate, mozzarella, cebolla blanca, orégano y pesto.', 23000, { veg: true, img: img('fugazza-portena') }),
  I('p-fuga-azul', 'portenas', 'Fugazza y queso azul', 'Salsa de tomate, mozzarella, cebolla blanca, queso azul y orégano.', 25000, { veg: true, img: img('fugazzeta'), hot: true }),
  I('p-azul', 'portenas', 'Queso azul', 'Salsa de tomate, mozzarella, queso azul, nueces, azúcar mascabo.', 28000, { veg: true }),
  I('p-hongos', 'portenas', 'Hongos frescos', 'Salsa de tomate, mozzarella, mix de champiñones y portobellos frescos, almendras tostadas y pesto.', 29000, { veg: true, img: img('hongos-bianca') }),
  I('p-mortadela', 'portenas', 'Mortadela con pistachos', 'Salsa de tomate, mozzarella, mortadela con pistachos, pistachos y pesto.', 28000),
  I('p-peras', 'portenas', 'Peras y queso azul', 'Salsa de tomate, mozzarella, peras, queso azul, azúcar.', 30000, { veg: true }),
  I('p-napo', 'portenas', 'Napo', 'Salsa de tomate, mozzarella, tomates, hebras de queso reggianito, orégano y pesto.', 22000, { veg: true, img: img('napo-portena') }),
  I('p-napo-jamon', 'portenas', 'Napo con jamón', 'Salsa de tomate, mozzarella, tomates, jamón cocido, orégano y pesto.', 28000),
  I('p-rucula', 'portenas', 'Rúcula y jamón', 'Salsa de tomate, mozzarella, jamón crudo, rúcula, tomate cherry, pesto.', 27000, { img: img('rucula2') }),
  I('p-especial', 'portenas', 'Especial', 'Salsa de tomate, mozzarella, jamón, tiras de pimiento rojo.', 27000, { img: img('especial') }),
  I('p-palmitos', 'portenas', 'Palmitos', 'Salsa de tomate, mozzarella, jamón, palmitos, salsa golf.', 30000),
  I('p-4quesos', 'portenas', 'Cuatro quesos', 'Salsa de tomate, mozzarella, cuartirolo, provolone, queso azul, pesto.', 28000, { veg: true, img: img('cuatroquesos') }),
  I('p-cantimpalo', 'portenas', 'Cantimpalo', 'Salsa de tomate, mozzarella, cantimpalo y orégano.', 28000, { img: img('cantimpalo') }),

  // Rellenas
  I('r-clasica', 'rellenas', 'Fugazzeta clásica', '¡800 g de pura muzzarella! Generosa, cremosa y llena de sabor, coronada con cebolla para el equilibrio perfecto.', 30000, { veg: true, img: img('fugazza-portena'), hot: true , ing: ['Cebolla'] }),
  I('r-jamon', 'rellenas', 'Fugazzeta con jamón', 'La clásica rellena, con jamón cocido.', 33000, { ing: ['Jamón cocido', 'Cebolla'] }),
  I('r-4quesos', 'rellenas', 'Fugazzeta 4 quesos', '¡Una bomba de queso! Rellena de muzzarella, queso azul, cuartirolo y reggianito. Para los verdaderos fanáticos del queso.', 36000, { veg: true , ing: ['Queso azul', 'Cuartirolo', 'Reggianito'] }),

  // Entre panes
  I('s-bondiola', 'entrepanes', 'Bondiola BBQ', 'Pan de pisa tipo panuozzo, bondiola desmechada, barbacoa, ensalada coleslaw, queso dambo.', 20000, { img: img('entrepan') }),
  I('s-asado', 'entrepanes', 'Tapa de asado', 'Pan de pisa tipo panuozzo, tapa de asado, rúcula, tomate, cebolla, pimientos y queso.', 20000),
  I('s-veggie', 'entrepanes', 'Veggie', 'Pan de pisa tipo panuozzo, champis, muzzalmendra, cebolla morada, cherrys y mix de verduras grilladas.', 19000, { veg: true }),

  // Otras opciones
  I('o-panchuke', 'otras', 'Panchuke clásico', 'Pancho al horno de barro con salsa de tomate, muzzarella, alioli.', 10000),
  I('o-panchuke-pisa', 'otras', 'Panchuke Pisa', 'Pancho con pan de pisa, salsa de tomate, muzza y pepperoni.', 11000),
  I('o-panchuke-cole', 'otras', 'Panchuke coleslaw', 'Pancho con pan de pisa, muzza y coleslaw con alioli de la casa.', 11000),
  I('o-panchuke-4q', 'otras', 'Panchuke 4 quesos', 'Pancho con pan de pisa, salsa de tomate, muzza, queso azul, reggianito y cuartirolo.', 11000),
  I('o-ensalada', 'otras', 'Ensalada de la casa', 'Hojas verdes, champiñones, tomates cherry, palmitos, granos de choclo y aliño de la casa.', 15000, { veg: true }),

  // Sin alcohol
  I('b-agua', 'sinalcohol', 'Agua', 'Sin gas.', 4000),
  I('b-agua-gas', 'sinalcohol', 'Agua con gas', '', 4000),
  I('b-saborizada', 'sinalcohol', 'Agua saborizada', '', 4000),
  I('b-gaseosa', 'sinalcohol', 'Gaseosa 500 ml', 'Línea Coca-Cola.', 4000),
  I('b-limonada', 'sinalcohol', 'Limonada', 'Jarra de la casa.', 9000, { img: img('limonada') }),
  I('b-limonada-mj', 'sinalcohol', 'Limonada con menta y jengibre', '', 10000, { img: img('limonada') }),

  // Con alcohol
  I('a-pinta', 'conalcohol', 'Pinta', 'Cerveza tirada. Consultá variedades al mozo.', 6500, { img: img('pinta') }),
  I('a-peroni', 'conalcohol', 'Peroni', 'Cerveza italiana, 330 ml.', 8000, { img: img('peroni') }),
  I('a-fernet', 'conalcohol', 'Fernet con coca', '', 9000, { img: img('fernet') }),
  I('a-aperol', 'conalcohol', 'Aperol', '', 10000),
  I('a-vermu', 'conalcohol', 'Vermú', '', 8000),
  I('a-campari', 'conalcohol', 'Campari', '', 9000),
  I('a-gancia', 'conalcohol', 'Gancia', '', 9000),
];
