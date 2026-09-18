import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Crown,
  CreditCard,
  Clock,
  Users,
  Building2,
  Briefcase,
  Tag,
  LogOut,
  Moon,
  Sun,
  Menu,
  X,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export interface AdminNavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  badge?: string;
  badgeColor?: string;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    to: '/admin/dashboard',
    label: 'Tổng quan hệ thống',
    icon: LayoutDashboard,
    desc: 'Số liệu thống kê, doanh thu, việc làm và tài khoản mới',
  },
  {
    to: '/admin/packages',
    label: 'Gói Premium & AI Quota',
    icon: Crown,
    desc: 'Quản lý giá, thời hạn sử dụng, quota và đồng bộ PayOS',
    badge: 'PRO',
    badgeColor: 'bg-amber-400 text-slate-950 font-black',
  },
  {
    to: '/admin/subscriptions',
    label: 'Quản lý thuê bao',
    icon: Clock,
    desc: 'Gia hạn thủ công và kiểm soát trạng thái gói người dùng',
  },
  {
    to: '/admin/payments',
    label: 'Giao dịch PayOS',
    icon: CreditCard,
    desc: 'Danh sách đơn hàng, đối soát thanh toán và hóa đơn',
  },
  {
    to: '/admin/users',
    label: 'Người dùng & Duyệt HR',
    icon: Users,
    desc: 'Kiểm duyệt nhà tuyển dụng và xử lý tài khoản',
  },
  {
    to: '/admin/companies',
    label: 'Doanh nghiệp',
    icon: Building2,
    desc: 'Xác minh doanh nghiệp và kiểm tra mã số thuế',
  },
  {
    to: '/admin/jobs',
    label: 'Tin tuyển dụng',
    icon: Briefcase,
    desc: 'Kiểm duyệt nội dung và quản lý trạng thái tin đăng',
  },
  {
    to: '/admin/skills',
    label: 'Từ điển kỹ năng',
    icon: Tag,
    desc: 'Chuẩn hóa danh mục kỹ năng hệ thống',
  },
];

export const AdminLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Determine current active navigation metadata based on path
  const currentNav =
    ADMIN_NAV_ITEMS.find((item) => location.pathname.startsWith(item.to)) || ADMIN_NAV_ITEMS[0];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* 1. Desktop & Mobile Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col justify-between border-r border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900 transition-transform duration-300 lg:static lg:translate-x-0 ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo & Portal Branding */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 dark:border-slate-800">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/25 group-hover:scale-105 transition-transform">
                <Crown className="h-5 w-5 text-amber-300" />
              </div>
              <div>
                <span className="text-base font-black tracking-tight text-slate-900 dark:text-white">
                  TalentPulse
                </span>
                <span className="ml-1.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
                  ADMIN
                </span>
                <p className="text-[10px] text-slate-400 font-medium">Bảng điều khiển hệ thống</p>
              </div>
            </Link>

            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {ADMIN_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-xs font-bold transition-all duration-200 cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center gap-3">
                        <Icon className={`h-4.5 w-4.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] ${
                            isActive ? 'bg-white text-indigo-700 font-bold' : item.badgeColor || 'bg-slate-200'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* Sidebar Footer */}
          <div className="border-t border-slate-100 p-4 dark:border-slate-800 space-y-2">
            <Link
              to="/"
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Về trang chủ TalentPulse</span>
            </Link>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4 text-amber-400" />
                ) : (
                  <Moon className="h-4 w-4 text-slate-500" />
                )}
                <span>{theme === 'dark' ? 'Sáng' : 'Tối'}</span>
              </button>

              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {isMobileSidebarOpen && (
        <div
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* 2. Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200/90 bg-white px-4 sm:px-8 dark:border-slate-800 dark:bg-slate-900 shadow-2xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div>
              <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>{currentNav.label}</span>
                {currentNav.badge && (
                  <span className="hidden sm:inline-flex rounded-full bg-amber-400 text-slate-950 px-2 py-0.5 text-[10px] font-black">
                    {currentNav.badge}
                  </span>
                )}
              </h1>
              <p className="hidden sm:block text-xs text-slate-400">{currentNav.desc}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Admin Avatar Indicator */}
            <div className="flex items-center gap-2.5 pl-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 text-white font-black text-xs shadow-xs">
                {user?.name?.charAt(0).toUpperCase() || 'A'}
              </div>
              <div className="hidden md:block text-left leading-tight">
                <p className="text-xs font-bold text-slate-900 dark:text-white">{user?.name}</p>
                <p className="text-[10px] text-slate-400">admin@talentpulse.com</p>
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Nested Route Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
