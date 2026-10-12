import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { getStaffSession } from "@/server/auth";
import { db } from "@/server/db";
import { tables } from "@/server/db/schema";
import { asc } from "drizzle-orm";
import { demoTablesStore, initializeDemoDataIfNeeded } from "@/server/demo-data";

export async function GET(request: NextRequest) {
  // 1. Role Guard: Manager or Admin only
  const session = await getStaffSession();
  if (!session || (session.role !== "manager" && session.role !== "admin")) {
    return new NextResponse(
      JSON.stringify({ error: "Unauthorized: Manager session required" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // 2. Fetch tables (DB with demo fallback)
  let tableList: Array<{ tableNumber: string; capacity: number; qrToken: string }> = [];

  try {
    const dbTables = await db.query.tables.findMany({
      orderBy: [asc(tables.tableNumber)],
    });
    if (dbTables && dbTables.length > 0) {
      tableList = dbTables.map((t) => ({
        tableNumber: t.tableNumber,
        capacity: t.capacity,
        qrToken: t.qrToken,
      }));
    }
  } catch (err) {
    console.warn("DB tables query fallback for PDF:", (err as Error).message);
  }

  if (tableList.length === 0) {
    initializeDemoDataIfNeeded();
    tableList = Array.from(demoTablesStore.values())
      .sort((a, b) => {
        const numA = parseInt(a.tableNumber.replace(/\D/g, "") || "0", 10);
        const numB = parseInt(b.tableNumber.replace(/\D/g, "") || "0", 10);
        return numA - numB;
      })
      .map((t) => ({
        tableNumber: t.tableNumber,
        capacity: t.capacity,
        qrToken: t.qrToken,
      }));
  }

  // Optional filter by table token or table number
  const singleToken = request.nextUrl.searchParams.get("token");
  if (singleToken) {
    tableList = tableList.filter((t) => t.qrToken === singleToken);
  }

  if (tableList.length === 0) {
    return new NextResponse("No tables found to generate QR codes", { status: 404 });
  }

  // Base URL for QR links
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const envAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const baseUrl = envAppUrl && envAppUrl.startsWith("http") ? envAppUrl : `${protocol}://${host}`;

  // 3. Generate PDF Document using PDFKit
  const pdfBuffer = await new Promise<Buffer>(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 36,
        autoFirstPage: false,
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const margin = 36;
      const contentWidth = pageWidth - margin * 2;
      const cardHeight = (pageHeight - margin * 2 - 20) / 2; // 2 cards per A4 page

      // Pre-generate QR code PNG buffers
      const qrBuffers: Map<string, Buffer> = new Map();
      for (const table of tableList) {
        const qrUrl = `${baseUrl}/t/${table.qrToken}`;
        const buffer = await QRCode.toBuffer(qrUrl, {
          margin: 1,
          width: 300,
          color: {
            dark: "#1B1714",
            light: "#FFFFFF",
          },
        });
        qrBuffers.set(table.qrToken, buffer);
      }

      // Render cards: 2 cards per page
      for (let i = 0; i < tableList.length; i++) {
        const table = tableList[i];
        if (!table) continue;
        const cardIndexOnPage = i % 2;

        if (cardIndexOnPage === 0) {
          doc.addPage();
        }

        const cardY = margin + cardIndexOnPage * (cardHeight + 20);

        // Draw Card Outer Frame
        doc
          .roundedRect(margin, cardY, contentWidth, cardHeight, 12)
          .lineWidth(1.5)
          .strokeColor("#8C2F1B")
          .stroke();

        // Inner decorative border
        doc
          .roundedRect(margin + 5, cardY + 5, contentWidth - 10, cardHeight - 10, 8)
          .lineWidth(0.5)
          .strokeColor("#D9C8B4")
          .stroke();

        // Header Banner inside card
        const cardInnerY = cardY + 22;

        doc
          .fontSize(10)
          .font("Helvetica-Bold")
          .fillColor("#8C2F1B")
          .text("CONCEPT PREVIEW BY INTALLO", margin, cardInnerY, {
            align: "center",
            width: contentWidth,
            characterSpacing: 2,
          });

        doc
          .fontSize(22)
          .font("Helvetica-Bold")
          .fillColor("#1B1714")
          .text("MASALA LANE", margin, cardInnerY + 16, {
            align: "center",
            width: contentWidth,
            characterSpacing: 1.5,
          });

        doc
          .fontSize(8)
          .font("Helvetica")
          .fillColor("#6E655F")
          .text("Warm Flavours · Regional Indian Craft · Bengaluru", margin, cardInnerY + 44, {
            align: "center",
            width: contentWidth,
          });

        // Table Number Callout
        doc
          .fontSize(20)
          .font("Helvetica-Bold")
          .fillColor("#8C2F1B")
          .text(table.tableNumber.toUpperCase(), margin, cardInnerY + 62, {
            align: "center",
            width: contentWidth,
          });

        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor("#6E655F")
          .text(`Seating Capacity: ${table.capacity} Guests`, margin, cardInnerY + 86, {
            align: "center",
            width: contentWidth,
          });

        // QR Code Image
        const qrBuf = qrBuffers.get(table.qrToken);
        if (qrBuf) {
          const qrSize = 140;
          const qrX = margin + (contentWidth - qrSize) / 2;
          const qrY = cardInnerY + 104;

          // QR container shadow/box
          doc
            .roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 6)
            .fillColor("#F8F5F0")
            .fill();

          doc.image(qrBuf, qrX, qrY, { width: qrSize, height: qrSize });
        }

        // Instructions
        const instructY = cardInnerY + 258;
        doc
          .fontSize(11)
          .font("Helvetica-Bold")
          .fillColor("#1B1714")
          .text("Scan with your phone camera to order", margin, instructY, {
            align: "center",
            width: contentWidth,
          });

        doc
          .fontSize(8)
          .font("Helvetica")
          .fillColor("#6E655F")
          .text("No app download required · Instant digital bill & UPI checkout", margin, instructY + 16, {
            align: "center",
            width: contentWidth,
          });

        doc
          .fontSize(7.5)
          .font("Helvetica-Oblique")
          .fillColor("#8C2F1B")
          .text(`${baseUrl}/t/${table.qrToken}`, margin, instructY + 30, {
            align: "center",
            width: contentWidth,
          });

        // Cut line indicator if top card
        if (cardIndexOnPage === 0) {
          const cutY = cardY + cardHeight + 10;
          doc
            .moveTo(margin + 20, cutY)
            .lineTo(pageWidth - margin - 20, cutY)
            .lineWidth(0.5)
            .dash(4, { space: 4 })
            .strokeColor("#C5BAAF")
            .stroke()
            .undash();
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Masala-Lane-Table-QRs.pdf"',
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
