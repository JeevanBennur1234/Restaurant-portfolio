import PDFDocument from "pdfkit";
import type { ReceiptData } from "./billing";

export interface ReceiptPdfOptions {
  format?: "a4" | "thermal";
}

/**
 * Generate PDF buffer for an order receipt or unpaid bill
 */
export async function generateReceiptPdf(
  data: ReceiptData,
  options: ReceiptPdfOptions = {}
): Promise<Buffer> {
  const format = options.format || "a4";

  if (format === "thermal") {
    return generateThermalReceiptPdf(data);
  }

  return generateA4ReceiptPdf(data);
}

/**
 * Standard A4 Receipt / Bill PDF generator
 */
function generateA4ReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 40,
        info: {
          Title: `${data.status === "PAID_RECEIPT" ? "Receipt" : "Bill"} ${data.orderNumber} - Masala Lane`,
          Author: "Masala Lane",
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      const pageWidth = 595.28;
      const margin = 40;
      const contentWidth = pageWidth - margin * 2;

      // 1. Restaurant Header
      doc.font("Helvetica-Bold").fontSize(22).fillColor("#1c1917").text(data.restaurant.name, { align: "center" });
      doc.font("Helvetica-Oblique").fontSize(9.5).fillColor("#78716c").text(data.restaurant.tagline, { align: "center" });
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(9).fillColor("#57534e").text(`${data.restaurant.address}, ${data.restaurant.city}`, { align: "center" });
      doc.text(`Phone: ${data.restaurant.phone}  |  GSTIN: ${data.restaurant.gstin}  |  FSSAI: ${data.restaurant.fssai}`, { align: "center" });
      doc.moveDown(0.8);

      // Divider
      doc.strokeColor("#d6d3d1").lineWidth(0.75).moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).stroke();
      doc.moveDown(0.8);

      // 2. Status Banner
      const bannerY = doc.y;
      const isPaid = data.status === "PAID_RECEIPT";
      const bannerBg = isPaid ? "#ecfdf5" : "#fffbeb";
      const bannerBorder = isPaid ? "#059669" : "#d97706";
      const bannerTextColor = isPaid ? "#065f46" : "#92400e";

      doc.rect(margin, bannerY, contentWidth, 38).fillAndStroke(bannerBg, bannerBorder);

      doc.font("Helvetica-Bold").fontSize(12).fillColor(bannerTextColor);
      if (isPaid) {
        doc.text("PAYMENT RECEIPT (PAID IN FULL)", margin + 12, bannerY + 8);
        doc.font("Helvetica").fontSize(9).text(`Receipt #: ${data.receiptNumber}   •   Paid: ${new Date(data.paidAt || data.createdAt).toLocaleString("en-IN")}`, margin + 12, bannerY + 22);
      } else {
        doc.text("*** UNPAID BILL - NOT A TAX RECEIPT ***", margin + 12, bannerY + 8);
        doc.font("Helvetica").fontSize(9).text(`Bill #: ${data.billNumber}   •   Please pay at the counter or scan UPI QR`, margin + 12, bannerY + 22);
      }

      doc.y = bannerY + 48;

      // 3. Meta Details Grid
      const metaTop = doc.y;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#1c1917");
      doc.text("Order Number:", margin, metaTop);
      doc.font("Helvetica").text(data.orderNumber, margin + 75, metaTop);

      doc.font("Helvetica-Bold").text("Table Number:", margin + 200, metaTop);
      doc.font("Helvetica").text(data.tableNumber, margin + 280, metaTop);

      doc.font("Helvetica-Bold").text("Date & Time:", margin + 350, metaTop);
      doc.font("Helvetica").text(new Date(data.createdAt).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }), margin + 420, metaTop);

      doc.moveDown(1.2);

      if (data.customer.name || data.customer.phone || data.paymentMethod) {
        const metaSecond = doc.y;
        if (data.customer.name) {
          doc.font("Helvetica-Bold").fontSize(9).text("Guest:", margin, metaSecond);
          doc.font("Helvetica").text(`${data.customer.name} ${data.customer.phone ? `(${data.customer.phone})` : ""}`, margin + 75, metaSecond);
        }
        if (data.paymentMethod) {
          doc.font("Helvetica-Bold").fontSize(9).text("Payment:", margin + 200, metaSecond);
          doc.font("Helvetica").text(data.paymentMethod.toUpperCase(), margin + 280, metaSecond);
        }
        if (data.paymentReference) {
          doc.font("Helvetica-Bold").fontSize(9).text("Ref #:", margin + 350, metaSecond);
          doc.font("Helvetica").text(data.paymentReference, margin + 420, metaSecond);
        }
        doc.moveDown(1.2);
      }

      // 4. Items Table
      const tableTop = doc.y;
      doc.rect(margin, tableTop, contentWidth, 22).fill("#f5f5f4");

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#1c1917");
      doc.text("ITEM DESCRIPTION", margin + 10, tableTop + 6);
      doc.text("QTY", margin + 310, tableTop + 6, { width: 40, align: "center" });
      doc.text("RATE", margin + 360, tableTop + 6, { width: 60, align: "right" });
      doc.text("AMOUNT", margin + 430, tableTop + 6, { width: 75, align: "right" });

      doc.y = tableTop + 26;

      data.items.forEach((item, index) => {
        const itemY = doc.y;
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#1c1917");
        doc.text(`${index + 1}. ${item.name}`, margin + 10, itemY);

        doc.font("Helvetica").fontSize(9.5).fillColor("#44403c");
        doc.text(String(item.quantity), margin + 310, itemY, { width: 40, align: "center" });
        doc.text(`INR ${(item.unitPricePaise / 100).toFixed(2)}`, margin + 360, itemY, { width: 60, align: "right" });
        doc.text(`INR ${(item.totalPaise / 100).toFixed(2)}`, margin + 430, itemY, { width: 75, align: "right" });

        doc.y += 14;

        if (item.modifiers && item.modifiers.length > 0) {
          doc.font("Helvetica").fontSize(8).fillColor("#78716c");
          item.modifiers.forEach((mod) => {
            doc.text(`+ ${mod.name}${mod.pricePaise > 0 ? ` (INR ${(mod.pricePaise / 100).toFixed(2)})` : ""}`, margin + 22, doc.y);
            doc.y += 11;
          });
        }

        if (item.notes) {
          doc.font("Helvetica-Oblique").fontSize(8).fillColor("#a8a29e");
          doc.text(`Note: ${item.notes}`, margin + 22, doc.y);
          doc.y += 11;
        }

        // Row border
        doc.strokeColor("#f5f5f4").lineWidth(0.5).moveTo(margin, doc.y + 2).lineTo(pageWidth - margin, doc.y + 2).stroke();
        doc.y += 6;
      });

      doc.moveDown(0.8);

      // 5. Totals Box
      const totalsY = doc.y;
      const totalsBoxWidth = 220;
      const totalsBoxX = pageWidth - margin - totalsBoxWidth;

      doc.font("Helvetica").fontSize(9).fillColor("#57534e");
      doc.text("Subtotal:", totalsBoxX, totalsY);
      doc.text(`INR ${(data.subtotalPaise / 100).toFixed(2)}`, totalsBoxX, totalsY, { width: totalsBoxWidth, align: "right" });

      doc.y = totalsY + 14;
      doc.text("CGST (2.5%):", totalsBoxX, doc.y);
      doc.text(`INR ${(data.cgstPaise / 100).toFixed(2)}`, totalsBoxX, doc.y, { width: totalsBoxWidth, align: "right" });

      doc.y += 14;
      doc.text("SGST (2.5%):", totalsBoxX, doc.y);
      doc.text(`INR ${(data.sgstPaise / 100).toFixed(2)}`, totalsBoxX, doc.y, { width: totalsBoxWidth, align: "right" });

      doc.y += 14;
      doc.strokeColor("#d6d3d1").lineWidth(0.75).moveTo(totalsBoxX, doc.y + 2).lineTo(pageWidth - margin, doc.y + 2).stroke();

      doc.y += 8;
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#1c1917");
      if (data.isTabBill) {
        doc.text("CONSOLIDATED TAB TOTAL:", totalsBoxX, doc.y);
        doc.text(`INR ${(data.totalPaise / 100).toFixed(2)}`, totalsBoxX, doc.y, { width: totalsBoxWidth, align: "right" });
        doc.y += 16;
        if ((data.alreadyPaidPaise ?? 0) > 0) {
          doc.font("Helvetica").fontSize(9).fillColor("#047857");
          doc.text("ALREADY PAID:", totalsBoxX, doc.y);
          doc.text(`INR ${((data.alreadyPaidPaise ?? 0) / 100).toFixed(2)}`, totalsBoxX, doc.y, { width: totalsBoxWidth, align: "right" });
          doc.y += 14;
          doc.font("Helvetica-Bold").fontSize(11).fillColor("#1c1917");
        }
        const balanceLabel = isPaid ? "COLLECTED AT SETTLEMENT:" : "AMOUNT DUE:";
        const balancePaise = isPaid
          ? (data.settlementAmountPaise ?? data.amountDuePaise ?? data.totalPaise)
          : (data.amountDuePaise ?? data.totalPaise);
        doc.text(balanceLabel, totalsBoxX, doc.y);
        doc.text(`INR ${(balancePaise / 100).toFixed(2)}`, totalsBoxX, doc.y, { width: totalsBoxWidth, align: "right" });
      } else {
        doc.text(isPaid ? "TOTAL PAID:" : "TOTAL DUE:", totalsBoxX, doc.y);
        doc.text(`INR ${(data.totalPaise / 100).toFixed(2)}`, totalsBoxX, doc.y, { width: totalsBoxWidth, align: "right" });
      }

      doc.moveDown(3);

      // 6. Footer Notes
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#1c1917").text("Thank you for dining with Masala Lane!", { align: "center" });
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(8).fillColor("#78716c");
      if (isPaid) {
        doc.text("This receipt is official confirmation of payment settled in full.", { align: "center" });
      } else {
        doc.text("This is an unpaid check. A tax invoice / paid receipt will be issued once payment is settled.", { align: "center" });
      }
      doc.text("For queries, email dining@masalane.restaurant or call +91 80 4123 4567.", { align: "center" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 80mm Narrow Thermal Receipt / Bill PDF generator
 */
function generateThermalReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // 80mm thermal paper width ~ 226 pt. Calculate height dynamically with base margin
      const thermalWidth = 226;
      const margin = 10;
      const estimatedHeight = 350 + data.items.length * 45;

      const doc = new PDFDocument({
        size: [thermalWidth, Math.max(500, estimatedHeight)],
        margin,
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      const isPaid = data.status === "PAID_RECEIPT";

      // Header
      doc.font("Courier-Bold").fontSize(13).fillColor("#000000").text(data.restaurant.name, { align: "center" });
      doc.font("Courier").fontSize(8).text(data.restaurant.address, { align: "center" });
      doc.text(data.restaurant.city, { align: "center" });
      doc.text(`Tel: ${data.restaurant.phone}`, { align: "center" });
      doc.text(`GSTIN: ${data.restaurant.gstin}`, { align: "center" });
      doc.text(`FSSAI: ${data.restaurant.fssai}`, { align: "center" });

      doc.moveDown(0.4);
      doc.text("----------------------------------------", { align: "center" });

      // Title Banner
      doc.font("Courier-Bold").fontSize(10).text(
        isPaid ? "*** PAYMENT RECEIPT ***" : "*** UNPAID BILL ***",
        { align: "center" }
      );
      doc.font("Courier").fontSize(8);
      if (isPaid) {
        doc.text(`Receipt: ${data.receiptNumber}`, { align: "center" });
      } else {
        doc.text(`Bill: ${data.billNumber}`, { align: "center" });
        doc.text("(NOT A RECEIPT - PLEASE PAY)", { align: "center" });
      }

      doc.text("----------------------------------------", { align: "center" });

      // Meta
      doc.text(`Table: ${data.tableNumber}     Order: ${data.orderNumber}`);
      doc.text(`Date: ${new Date(data.createdAt).toLocaleDateString("en-IN")} ${new Date(data.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`);
      if (data.customer.name) {
        doc.text(`Guest: ${data.customer.name}`);
      }
      if (data.paymentMethod) {
        doc.text(`Payment: ${data.paymentMethod.toUpperCase()}`);
      }

      doc.text("----------------------------------------", { align: "center" });

      // Items Column Header
      doc.font("Courier-Bold").fontSize(8);
      doc.text("Item                    Qty      Amt", { align: "left" });
      doc.font("Courier").fontSize(8);
      doc.text("----------------------------------------", { align: "center" });

      // Items
      data.items.forEach((item) => {
        const itemLine = `${item.name.slice(0, 20).padEnd(21)} ${String(item.quantity).padStart(2)} ${(item.totalPaise / 100).toFixed(2).padStart(9)}`;
        doc.text(itemLine);

        if (item.modifiers && item.modifiers.length > 0) {
          item.modifiers.forEach((m) => {
            doc.text(`  + ${m.name.slice(0, 20)}`);
          });
        }
      });

      doc.text("----------------------------------------", { align: "center" });

      // Totals
      const subtotalLine = `Subtotal:              INR ${(data.subtotalPaise / 100).toFixed(2).padStart(8)}`;
      const cgstLine = `CGST (2.5%):           INR ${(data.cgstPaise / 100).toFixed(2).padStart(8)}`;
      const sgstLine = `SGST (2.5%):           INR ${(data.sgstPaise / 100).toFixed(2).padStart(8)}`;

      doc.text(subtotalLine);
      doc.text(cgstLine);
      doc.text(sgstLine);
      doc.font("Courier-Bold").fontSize(9);
      doc.text("========================================", { align: "center" });
      if (data.isTabBill) {
        doc.text(`TAB TOTAL:             INR ${(data.totalPaise / 100).toFixed(2).padStart(8)}`);
        if ((data.alreadyPaidPaise ?? 0) > 0) {
          doc.text(`ALREADY PAID:          INR ${((data.alreadyPaidPaise ?? 0) / 100).toFixed(2).padStart(8)}`);
        }
        const balancePaise = isPaid
          ? (data.settlementAmountPaise ?? data.amountDuePaise ?? data.totalPaise)
          : (data.amountDuePaise ?? data.totalPaise);
        const label = isPaid ? "COLLECTED NOW:" : "AMOUNT DUE:";
        doc.text(`${label.padEnd(23)}INR ${(balancePaise / 100).toFixed(2).padStart(8)}`);
      } else {
        const totalLine = `${(isPaid ? "TOTAL PAID:" : "TOTAL DUE:").padEnd(23)}INR ${(data.totalPaise / 100).toFixed(2).padStart(8)}`;
        doc.text(totalLine);
      }
      doc.text("========================================", { align: "center" });

      doc.font("Courier").fontSize(8);
      if (isPaid) {
        doc.text("Status: PAID IN FULL", { align: "center" });
        if (data.paymentReference) {
          doc.text(`Ref: ${data.paymentReference}`, { align: "center" });
        }
      } else {
        doc.text("Status: UNPAID BILL", { align: "center" });
        doc.text("Please settle at the counter", { align: "center" });
      }

      doc.moveDown(0.5);
      doc.text("Thank you for visiting Masala Lane!", { align: "center" });
      doc.text("Visit again soon!", { align: "center" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
