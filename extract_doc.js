const mammoth = require('mammoth');

mammoth.extractRawText({path: 'Arquitectura_de_Software_Proyecto.docx'})
  .then(r => console.log(r.value))
  .catch(e => console.error(e));
