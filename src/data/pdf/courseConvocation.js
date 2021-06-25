const get = require('lodash/get');
const FileHelper = require('../../helpers/file');
const { COPPER_500, COPPER_GREY_200 } = require('../../helpers/constants');

const getImages = async () => {
  const imageList = [
    { url: 'https://storage.googleapis.com/compani-main/aux-pouce.png', name: 'aux-pouce.png' },
    { url: 'https://storage.googleapis.com/compani-main/doct-explication.png', name: 'doct-explication.png' },
    { url: 'https://storage.googleapis.com/compani-main/doct-quizz.png', name: 'doct-quizz.png' },
    { url: 'https://storage.googleapis.com/compani-main/aux-perplexite.png', name: 'aux-perplexite.png' },
  ];

  return FileHelper.downloadImages(imageList);
};

const getHeader = (image, misc, subProgram) => {
  const title = `${get(subProgram, 'program.name') || ''}${misc ? ` - ${misc}` : ''}`;

  return [
    {
      columns: [
        { image, width: 64, style: 'img' },
        [
          { text: 'Vous êtes convoqué(e) à la formation', style: 'surtitle' },
          { text: title, style: 'title' },
          { canvas: [{ type: 'line', x1: 20, y1: 10, x2: 450, y2: 10, lineWidth: 1.5, lineColor: COPPER_GREY_200 }] },
        ],
      ],
    },
  ];
};

const getSlotTableContent = slot => [
  { text: slot.date, style: 'tableContent' },
  { text: slot.hours, style: 'tableContent' },
  { text: slot.address, style: 'tableContent' },
];

const getTable = (slots, slotsToPlan) => {
  const body = [
    [
      { text: 'Dates', style: 'tableHeader' },
      { text: 'Heures', style: 'tableHeader' },
      { text: 'Lieux', style: 'tableHeader' },
    ],
  ];
  slots.forEach((slot) => { body.push(getSlotTableContent(slot)); });

  const table = [
    {
      table: { body, height: 24, widths: ['auto', '*', '*'] },
      layout: { vLineWidth: () => 0, hLineWidth: () => 1, hLineColor: () => COPPER_GREY_200 },
      marginTop: 24,
    },
  ];

  if (slotsToPlan && slotsToPlan.length) {
    table.push({ text: `Il reste ${slotsToPlan.length} créneau(x) à planifier.`, style: 'notes' });
  }

  return table;
};

const getProgramInfo = (image, program) => ({
  columns: [
    { image, width: 64, style: 'img' },
    [
      { text: 'Programme de la formation', style: 'infoTitle' },
      { text: program.description || '', style: 'infoContent' },
    ],
  ],
  marginTop: 24,
});

const getTrainerAndContactInfo = (trainerImg, trainer, contactImg, contact) => ({
  columns: [
    {
      columns: [
        { image: trainerImg, width: 64, style: 'img' },
        [
          { text: 'Intervenant(e)', style: 'infoTitle' },
          { text: get(trainer, 'formattedIdentity') || '', style: 'infoSubTitle' },
          { text: get(trainer, 'biography') || '', style: 'infoContent' },
        ],
      ],
    },
    {
      columns: [
        { image: contactImg, width: 64, style: 'img' },
        [
          { text: 'Votre contact pour la formation', style: 'infoTitle' },
          { text: get(contact, 'formattedPhone') || '', style: 'infoSubTitle' },
          { text: get(contact, 'email') || '', style: 'infoSubTitle' },
        ],
      ],
    },
  ],
  marginTop: 24,
});

exports.getPdfContent = async (data) => {
  const [thumb, explanation, quizz, confused] = await getImages();

  const header = getHeader(thumb, data.misc, data.subProgram);
  const table = getTable(data.slots, data.slotsToPlan);
  const programInfo = getProgramInfo(explanation, data.subProgram.program);
  const trainerAndContactInfo = getTrainerAndContactInfo(quizz, data.trainer, confused, data.contact);

  return {
    content: [header, table, programInfo, trainerAndContactInfo].flat(),
    defaultStyle: { font: 'SourceSans', fontSize: 10 },
    styles: {
      title: { fontSize: 20, bold: true, color: COPPER_500, marginLeft: 24 },
      surtitle: { fontSize: 12, bold: true, marginTop: 24, marginLeft: 24 },
      tableHeader: { fontSize: 12, bold: true, alignment: 'center', marginTop: 4, marginBottom: 4 },
      tableContent: { fontSize: 12, alignment: 'center', marginTop: 4, marginBottom: 4 },
      notes: { italics: true, marginTop: 4 },
      infoTitle: { fontSize: 14, bold: true, marginLeft: 12 },
      infoSubTitle: { fontSize: 12, marginLeft: 12 },
      infoContent: { italics: true, marginLeft: 12 },
    },
  };
};