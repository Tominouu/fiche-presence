const fs = require("fs");
const { PDFDocument } = require("pdf-lib");

function repartirHeures(h) {
  if (h === 8) {
    return {
      total: "08H",
      matin_face: "04H",
      matin_auto: "00H",
      aprem_face: "04H",
      aprem_auto: "00H"
    };
  }

  if (h === 4) {
    return {
      total: "04H",
      matin_face: "00H",
      matin_auto: "00H",
      aprem_face: "04H",
      aprem_auto: "00H"
    };
  }

  if (h === 2) {
    return {
      total: "02H",
      matin_face: "02H",
      matin_auto: "00H",
      aprem_face: "00H",
      aprem_auto: "00H"
    };
  }
}

async function main() {
  const templateBytes = fs.readFileSync("template.pdf");
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];

  const data = JSON.parse(fs.readFileSync("data.json"));
  const jours = data.slice(4);
  const meta = data[0];
  const meta2 = data[1];
  const meta3 = data[2];
  const meta4 = data[3];

  const startY = 675;
  const lineHeight = 15;

  page.drawText("MMI", { x: 370, y: 800, size: 15 });
  page.drawText(meta.name, { x: 150, y: 740, size: 12 });
  page.drawText(meta2.mois, { x: 150, y: 725, size: 12 });
  page.drawText(meta3["date-realisation"], { x: 120, y: 110, size: 12 });
  page.drawText(meta4["directeur"], { x: 330, y: 110, size: 12 });

  jours.forEach((jour, index) => {
    const y = startY - index * lineHeight;
    const h = repartirHeures(jour.hours);
    
    page.drawText(jour.date, { x: 40, y, size: 10 });

    page.drawText(h.total, { x: 110, y, size: 10 });

    page.drawText(h.matin_face, { x: 245, y, size: 10 });
    page.drawText(h.matin_auto, { x: 300, y, size: 10 });

    page.drawText(h.aprem_face, { x: 385, y, size: 10 });
    page.drawText(h.aprem_auto, { x: 440, y, size: 10 });
  });

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync("output.pdf", pdfBytes);

  console.log("PDF généré !");
}

main();