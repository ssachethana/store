// app/api/sales/route.ts
import { NextRequest, NextResponse } from "next/server";
import {prisma} from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma";
import { auth } from "@/auth"

// ─── Helper: get current UTC date strings ────────────────────────────────────
function getDateKeys() {
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const year = now.getUTCFullYear();
  const weekNum = getISOWeek(now);
  return {
    dayKey,
    weekKey: `${year}-W${String(weekNum).padStart(2, "0")}`,
    monthKey: `${year}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
    yearKey: String(year),
  };
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ─── GET /api/sales?shopId=X  →  products list with ALL valid batches ─────────
export async function GET(req: NextRequest) {
  const session = await auth();
  
  // 1. Extract the raw string ID safely
  const rawShopId = session?.user?.shopId; 

  if (!rawShopId) {
    return NextResponse.json(
      { error: "You haven't shop " },
      { status: 401 }
    );
  }

  // 2. Explicitly convert it to a number for Prisma
  const shopId   = Number(rawShopId);

  

  if (isNaN(shopId)) {
    return NextResponse.json({ error: "Invalid shop ID" }, { status: 400 });
  }

  try {
    const now = new Date();

    const products = await prisma.product.findMany({
      where: {
        shopId,
        isActive: true,
        displayProductInApp: true,
      },
      include: {
        unit: true,
        category: true,
        brand: true,
        // ── Fetch ALL valid batches (not just the first one) ──────────────────
        batches: {
          where: {
            remaining: { gt: 0 },
            OR: [{ expiryDate: null }, { expiryDate: { gt: now } }],
          },
          orderBy: { purchasedAt: "asc" }, // oldest first (FIFO default)
          select: {
            id: true,
            sellPrice: true,
            costPerUnit: true,
            remaining: true,
            purchasedAt: true,
            expiryDate: true,
          },
        },
        promotions: {
          where: {
            isActive: true,
            startDate: { lte: now },
            endDate: { gte: now },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    // Compute total stock per product across all valid batches
    const stockMap = await prisma.purchaseBatch.groupBy({
      by: ["productId"],
      where: {
        shopId,
        remaining: { gt: 0 },
        OR: [{ expiryDate: null }, { expiryDate: { gt: now } }],
      },
      _sum: { remaining: true },
    });

    const stockByProduct = new Map<number, number>(
  stockMap.map((s) => [s.productId, s._sum.remaining ? Number(s._sum.remaining) : 0])
);

    const serialised = products.map((p) => {
      const firstBatch = p.batches[0] ?? null;
      const promo = p.promotions[0] ?? null;

      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        imageUrl: p.imageUrl,
        description: p.description,
        lowStockThreshold: p.lowStockThreshold,
        isActive: p.isActive,
        displayProductInApp: p.displayProductInApp,
        unit: p.unit,
        category: p.category,
        brand: p.brand,
        currentStock: stockByProduct.get(p.id) ?? 0,
        // Default sell/cost price comes from the first (oldest) batch
        sellPrice: firstBatch?.sellPrice ? Number(firstBatch.sellPrice) : null,
        costPerUnit: firstBatch?.costPerUnit ? Number(firstBatch.costPerUnit) : null,
        activePromotion: promo
          ? {
              id: promo.id,
              name: promo.name,
              discountType: promo.discountType,
              value: Number(promo.value),
            }
          : null,
        // ── All valid batches exposed to the client ───────────────────────────
        batches: p.batches.map((b) => ({
          id: b.id,
          sellPrice: b.sellPrice ? Number(b.sellPrice) : null,
          costPerUnit: b.costPerUnit ? Number(b.costPerUnit) : null,
          remaining: Number(b.remaining),
          purchasedAt: b.purchasedAt.toISOString(),
          expiryDate: b.expiryDate ? b.expiryDate.toISOString() : null,
        })),
      };
    });

    return NextResponse.json({ products: serialised });
  } catch (error) {
    console.error("[GET /api/sales]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST /api/sales  →  create a sale ───────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  const rawShopId = session?.user?.shopId;

  if (!rawShopId) {
    return NextResponse.json({ error: "You haven't shop " }, { status: 401 });
  }

  const shopId = Number(rawShopId);
  if (isNaN(shopId)) {
    return NextResponse.json({ error: "Invalid shop ID" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { cashierId, customerId, paymentMethod, totalAmount, items } = body as {
      cashierId?: number;
      customerId?: number;
      paymentMethod: string;
      totalAmount: number;
      items: {
        productId: number;
        quantity: number;
        price: number;
        costAtSale: number;
        batchId?: number;
      }[];
    };

    if (!items?.length || !totalAmount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const now = new Date();
    const { dayKey, weekKey, monthKey, yearKey } = getDateKeys();

    const sale = await prisma.$transaction(async (tx) => {
      const saleItemsData: Prisma.SaleItemCreateManySaleInput[] = [];
      const batchLinks: { saleItemIdx: number; batchId: number; qty: Prisma.Decimal }[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { valuationMethod: true },
        });

        let availableBatches;
        if (item.batchId) {
          const pinnedBatch = await tx.purchaseBatch.findFirst({
            where: {
              id: item.batchId,
              productId: item.productId,
              shopId,
              remaining: { gt: 0 },
              OR: [{ expiryDate: null }, { expiryDate: { gt: now } }],
            },
          });

          if (!pinnedBatch) {
            throw new Error(
              `Selected batch ${item.batchId} for product ${item.productId} is unavailable`
            );
          }

          const orderDir = product?.valuationMethod === 1 ? "desc" : "asc";
          const fallbackBatches = await tx.purchaseBatch.findMany({
            where: {
              productId: item.productId,
              shopId,
              id: { not: item.batchId },
              remaining: { gt: 0 },
              OR: [{ expiryDate: null }, { expiryDate: { gt: now } }],
            },
            orderBy: { purchasedAt: orderDir },
          });

          availableBatches = [pinnedBatch, ...fallbackBatches];
        } else {
          const orderDir = product?.valuationMethod === 1 ? "desc" : "asc";
          availableBatches = await tx.purchaseBatch.findMany({
            where: {
              productId: item.productId,
              shopId,
              remaining: { gt: 0 },
              OR: [{ expiryDate: null }, { expiryDate: { gt: now } }],
            },
            orderBy: { purchasedAt: orderDir },
          });
        }

        // ── Decimal-safe depletion loop ──────────────────────────────────────
        let needed = new Prisma.Decimal(item.quantity);

        for (const batch of availableBatches) {
          if (needed.lessThanOrEqualTo(0)) break;

          const batchRemaining = new Prisma.Decimal(batch.remaining);
          const take = Prisma.Decimal.min(needed, batchRemaining);
          needed = needed.minus(take);

          await tx.purchaseBatch.update({
            where: { id: batch.id },
            data: { remaining: { decrement: take } },
          });

          batchLinks.push({ saleItemIdx: i, batchId: batch.id, qty: take });
        }

        if (needed.greaterThan(0)) {
          throw new Error(`Insufficient stock for product ${item.productId}`);
        }

        saleItemsData.push({
          productId: item.productId,
          quantity: new Prisma.Decimal(item.quantity),
          price: new Prisma.Decimal(item.price),
          costAtSale: new Prisma.Decimal(item.costAtSale),
        });
      }

      const newSale = await tx.sale.create({
        data: {
          shopId,
          cashierId: cashierId ?? null,
          customerId: customerId ?? null,
          paymentMethod: paymentMethod as any,
          totalAmount: new Prisma.Decimal(totalAmount),
          status: "COMPLETED",
          items: { createMany: { data: saleItemsData } },
        },
        include: { items: true },
      });

      for (const link of batchLinks) {
        const saleItem = newSale.items[link.saleItemIdx];
        await tx.saleItemBatch.create({
          data: {
            saleItemId: saleItem.id,
            batchId: link.batchId,
            quantity: link.qty,
          },
        });
      }

      // Analytics — costAtSale * quantity is now Decimal * Decimal-ish; keep as numbers here
      // since ShopAnalytics fields are Float, this is fine as-is.
      const totalCost = items.reduce((s, it) => s + it.costAtSale * it.quantity, 0);
      const totalRevenue = totalAmount;
      const totalProfit = totalRevenue - totalCost;

      const analytics = await tx.shopAnalytics.findUnique({ where: { shopId } });

      if (!analytics) {
        await tx.shopAnalytics.create({
          data: {
            shopId,
            currentDayKey: dayKey,
            currentWeekKey: weekKey,
            currentMonthKey: monthKey,
            currentYearKey: yearKey,
            dayTotalRevenue: totalRevenue,
            dayTotalCost: totalCost,
            dayTotalProfit: totalProfit,
            daySaleCount: 1,
            weekTotalRevenue: totalRevenue,
            weekTotalCost: totalCost,
            weekTotalProfit: totalProfit,
            weekSaleCount: 1,
            monthTotalRevenue: totalRevenue,
            monthTotalCost: totalCost,
            monthTotalProfit: totalProfit,
            monthSaleCount: 1,
            yearTotalRevenue: totalRevenue,
            yearTotalCost: totalCost,
            yearTotalProfit: totalProfit,
            yearSaleCount: 1,
          },
        });
      } else {
        const isDayReset = analytics.currentDayKey !== dayKey;
        const isWeekReset = analytics.currentWeekKey !== weekKey;
        const isMonthReset = analytics.currentMonthKey !== monthKey;
        const isYearReset = analytics.currentYearKey !== yearKey;

        await tx.shopAnalytics.update({
          where: { shopId },
          data: {
            currentDayKey: dayKey,
            currentWeekKey: weekKey,
            currentMonthKey: monthKey,
            currentYearKey: yearKey,
            dayTotalRevenue: isDayReset ? totalRevenue : { increment: totalRevenue },
            dayTotalCost: isDayReset ? totalCost : { increment: totalCost },
            dayTotalProfit: isDayReset ? totalProfit : { increment: totalProfit },
            daySaleCount: isDayReset ? 1 : { increment: 1 },
            weekTotalRevenue: isWeekReset ? totalRevenue : { increment: totalRevenue },
            weekTotalCost: isWeekReset ? totalCost : { increment: totalCost },
            weekTotalProfit: isWeekReset ? totalProfit : { increment: totalProfit },
            weekSaleCount: isWeekReset ? 1 : { increment: 1 },
            monthTotalRevenue: isMonthReset ? totalRevenue : { increment: totalRevenue },
            monthTotalCost: isMonthReset ? totalCost : { increment: totalCost },
            monthTotalProfit: isMonthReset ? totalProfit : { increment: totalProfit },
            monthSaleCount: isMonthReset ? 1 : { increment: 1 },
            yearTotalRevenue: isYearReset ? totalRevenue : { increment: totalRevenue },
            yearTotalCost: isYearReset ? totalCost : { increment: totalCost },
            yearTotalProfit: isYearReset ? totalProfit : { increment: totalProfit },
            yearSaleCount: isYearReset ? 1 : { increment: 1 },
          },
        });
      }

      return newSale;
    });

    return NextResponse.json(
      {
        sale: {
          id: sale.id,
          totalAmount: Number(sale.totalAmount),
          status: sale.status,
          paymentMethod: sale.paymentMethod,
          shopId: sale.shopId,
          cashierId: sale.cashierId,
          customerId: sale.customerId,
          createdAt: sale.createdAt.toISOString(),
          items: sale.items.map((it) => ({
            id: it.id,
            productId: it.productId,
            quantity: Number(it.quantity), // Decimal → number for the client
            price: Number(it.price),
            costAtSale: Number(it.costAtSale),
          })),
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[POST /api/sales]", error);
    if (error.message?.includes("Insufficient stock")) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error.message?.includes("unavailable")) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
