import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import forge from "node-forge";
import { SignPdf } from "@signpdf/signpdf";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { P12Signer } from "@signpdf/signer-p12";
import { SUBFILTER_ETSI_CADES_DETACHED } from "@signpdf/utils";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

function makeP12() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 864e5);
  const attrs = [{ name: "commonName", value: "OpenAppHub seal (spike)" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], "", { algorithm: "3des" });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary");
}

export async function sealDemo() {
  const t0 = Date.now();
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Bylaws of Riverside Community Association, Article IX amended", {
    x: 50,
    y: 720,
    size: 14,
    font,
  });
  page.drawText("Signed: Jordan Lee, Secretary  2026-11-17", {
    x: 50,
    y: 120,
    size: 12,
    font,
    color: rgb(0, 0, 0.6),
  });
  pdflibAddPlaceholder({
    pdfDoc: doc,
    reason: "Executed",
    contactInfo: "",
    name: "OpenAppHub",
    location: "",
    subFilter: SUBFILTER_ETSI_CADES_DETACHED,
  });
  const unsigned = Buffer.from(await doc.save({ useObjectStreams: false }));
  const t1 = Date.now();
  const p12 = makeP12();
  const t2 = Date.now();
  const signed = await new SignPdf().sign(unsigned, new P12Signer(p12));
  const t3 = Date.now();
  return {
    bytes: signed.length,
    sha256: createHash("sha256").update(signed).digest("hex").slice(0, 16),
    hasSig: signed.includes("/ByteRange"),
    ms: { build: t1 - t0, keygen: t2 - t1, seal: t3 - t2 },
  };
}
