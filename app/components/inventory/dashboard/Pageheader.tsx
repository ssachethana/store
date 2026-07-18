import { LayoutDashboard, Receipt, UserPlus, PlusCircle } from "lucide-react";

interface PageHeaderProps {
  onAddExpense: () => void;
  onAddCustomer: () => void;
}

export function PageHeader({ onAddExpense, onAddCustomer }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <LayoutDashboard size={20} className="text-[#F5A623]" />
        <h2 className="text-base font-bold text-gray-800">Dashboard</h2>
      </div>
      <div className="flex gap-2.5">
        <button
          onClick={onAddExpense}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 shadow-sm transition"
        >
          <Receipt size={15} className="text-red-400" />
          Add Expense
        </button>
        <button
          onClick={onAddCustomer}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 shadow-sm transition"
        >
          <UserPlus size={15} className="text-emerald-500" />
          Add Customer
        </button>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold shadow-sm hover:bg-gray-700 transition">
          <PlusCircle size={15} />
          Add Product
        </button>
      </div>
    </div>
  );
}