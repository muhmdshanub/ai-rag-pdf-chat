const PDFDocument = require('pdfkit');
const fs = require('fs');

const doc = new PDFDocument();
doc.pipe(fs.createWriteStream('test_space_exploration.pdf'));

doc.fontSize(25).text('Space Exploration Facts', { align: 'center' });
doc.moveDown();
doc.fontSize(12).text('1. The Apollo 11 mission was the first manned mission to land on the Moon. It was launched on July 16, 1969, and astronauts Neil Armstrong and Buzz Aldrin stepped onto the lunar surface on July 20, 1969.');
doc.moveDown();
doc.text('2. Mars is the fourth planet from the Sun and the second-smallest planet in the Solar System. It is often referred to as the Red Planet due to the iron oxide prevalent on its surface, which gives it a reddish appearance.');
doc.moveDown();
doc.text('3. The Voyager 1 spacecraft, launched in 1977, is the farthest human-made object from Earth. It crossed the heliopause and entered interstellar space in 2012.');
doc.moveDown();
doc.text('4. A light-year is a unit of length used to express astronomical distances and is equivalent to about 9.46 trillion kilometers (5.88 trillion miles).');

doc.end();
console.log('PDF generated: test_space_exploration.pdf');
