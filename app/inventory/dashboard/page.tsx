"use client";

import { useState } from "react";
import { Period } from "@/app/components/inventory/dashboard/types";
import { recentSales, topProducts, recentExpenses } from "@/app/components/inventory/dashboard/Mock";
import { buildStats } from "@/app/components/inventory/dashboard/buildStats";
import { useShopAnalytics } from "@/app/components/inventory/dashboard/Useshopanalytics";

import { Navbar } from "@/app/components/inventory/dashboard/Navbar";
import { SearchBar } from "@/app/components/inventory/dashboard/Searchbar";
import { PageHeader } from "@/app/components/inventory/dashboard/Pageheader";
import { PeriodToolbar } from "@/app/components/inventory/dashboard/Periodtoolbar";
import { ErrorBanner } from "@/app/components/inventory/dashboard/Errorbanner";
import { StatCardsGrid } from "@/app/components/inventory/dashboard/ Statcardsgrid";
import { RecentSalesTable } from "@/app/components/inventory/dashboard/Recentsalestable";
import { TopProductsCard } from "@/app/components/inventory/dashboard/Topproductscard";
import { RecentExpensesCard } from "@/app/components/inventory/dashboard/Recentexpensescard";
import { QuickActions } from "@/app/components/inventory/dashboard/Quickactions";
import { AddExpenseModal } from "@/app/components/inventory/addexpensemodal";
import { AddCustomerModal } from "@/app/components/inventory/ addcustomermodal";

export default function DashboardPage() {
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [period, setPeriod] = useState<Period>("month");

  const { analytics, loading, error, refetch } = useShopAnalytics();

  const stats = analytics ? buildStats(analytics, period) : [];

  return (
    <div className="min-h-screen bg-[#F4F4F4] font-sans">
      <Navbar />
      <SearchBar />

      {/* UPDATED: Changed px-8 to px-4 sm:px-8 for better mobile padding */}
      <main className="px-4 sm:px-8 py-6 space-y-6">
        <PageHeader
          onAddExpense={() => setShowExpenseModal(true)}
          onAddCustomer={() => setShowCustomerModal(true)}
        />

        <PeriodToolbar
          period={period}
          onPeriodChange={setPeriod}
          loading={loading}
          onRefresh={refetch}
        />

        {error && <ErrorBanner message={error} onRetry={refetch} />}

        <StatCardsGrid loading={loading} stats={stats} />

        {/* UPDATED: Changed grid-cols-3 to 1 column on mobile, 3 on large screens */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          
          {/* UPDATED: Sales table takes 2 columns on desktop, 1 on mobile */}
          <div className="lg:col-span-2">
            <RecentSalesTable sales={recentSales} />
          </div>

          {/* UPDATED: Side cards take 1 column and wrap nicely */}
          <div className="flex flex-col gap-5 lg:col-span-1">
            <TopProductsCard products={topProducts} />
            <RecentExpensesCard
              expenses={recentExpenses}
              onAddExpense={() => setShowExpenseModal(true)}
            />
          </div>
        </div>

        <QuickActions
          onAddExpense={() => setShowExpenseModal(true)}
          onAddCustomer={() => setShowCustomerModal(true)}
        />
      </main>

      {showExpenseModal && <AddExpenseModal onClose={() => setShowExpenseModal(false)} />}
      {showCustomerModal && <AddCustomerModal onClose={() => setShowCustomerModal(false)} />}
    </div>
  );
}