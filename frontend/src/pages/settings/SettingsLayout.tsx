import { type ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  UserRound,
  KeyRound,
  ShieldCheck,
  ChevronRight,
  Home,
  Building2,
  CheckCircle2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import Header from '../../components/layout/Header';
import { useAuth } from '../../auth/AuthContext';

interface SettingsLayoutProps {
  children: ReactNode;
  activeTab: 'profile' | 'password';
}

export function SettingsLayout({ children, activeTab }: SettingsLayoutProps) {
  const { user } = useAuth();
  const isHr = user?.role === 'HR';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans antialiased transition-colors duration-200">
      <Header />

      <main className="flex-1 pb-16 pt-24 sm:pt-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 hover:text-primary transition-colors"
            >
              <Home className="h-3.5 w-3.5" />
              <span>Trang chủ</span>
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-700 dark:text-slate-300 font-medium">Cài đặt tài khoản</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-primary font-semibold">
              {activeTab === 'profile' ? 'Cập nhật thông tin cá nhân' : 'Đổi mật khẩu'}
            </span>
          </nav>

          {/* Page Heading */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary/10 via-sky-500/10 to-indigo-500/10 dark:from-primary/15 dark:via-sky-500/10 dark:to-indigo-500/15 p-6 sm:p-8 border border-primary/15 dark:border-primary/20 backdrop-blur-sm">
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 text-primary dark:text-primary-light text-xs font-bold tracking-wide uppercase">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Cá nhân & Bảo mật</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                  Thiết lập tài khoản
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-xl">
                  Quản lý thông tin định danh, tùy chọn tìm kiếm việc làm và tăng cường bảo mật cho tài khoản của bạn.
                </p>
              </div>

              {/* Role badge */}
              <div className="shrink-0 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-sm backdrop-blur">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <div className="text-xs">
                  <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Vai trò hiện tại</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {isHr ? 'Nhà tuyển dụng (HR)' : 'Ứng viên tìm việc'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Main 2-Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Sidebar Navigation (4 cols) */}
            <aside className="lg:col-span-4 space-y-6">
              {/* User Mini Profile Card */}
              <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900/90 p-5 shadow-sm backdrop-blur">
                <div className="flex items-center gap-4">
                  <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-tr from-primary to-sky-500 p-0.5 shadow-md shrink-0">
                    <div className="h-full w-full rounded-[14px] bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden">
                      {user?.avatar ? (
                        <img
                          src={user.avatar}
                          alt={user.name || 'User Avatar'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-lg font-black text-primary">
                          {(user?.name?.[0] || 'U').toUpperCase()}
                        </span>
                      )}
                    </div>
                    {user?.isVerified && (
                      <span className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5 shadow-sm ring-2 ring-white dark:ring-slate-900" title="Tài khoản đã xác thực">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {user?.name || 'Người dùng'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {user?.email}
                    </p>
                    {isHr && user?.company?.name && (
                      <p className="text-[11px] text-primary dark:text-primary-light font-medium truncate flex items-center gap-1 mt-1">
                        <Building2 className="h-3 w-3 shrink-0" />
                        <span>{user.company.name}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Navigation Menu */}
              <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900/90 p-2 sm:p-3 shadow-sm space-y-1.5">
                <NavLink
                  to="/settings/profile"
                  className={({ isActive }) =>
                    `group flex items-start gap-3.5 p-3.5 rounded-2xl transition-all duration-150 cursor-pointer ${
                      isActive || activeTab === 'profile'
                        ? 'bg-primary text-white shadow-md shadow-primary/25 font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                          isActive || activeTab === 'profile'
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-primary/10 group-hover:text-primary'
                        }`}
                      >
                        <UserRound className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block text-sm leading-tight font-bold">
                          Thông tin cá nhân
                        </span>
                        <span
                          className={`block text-xs mt-1 leading-normal ${
                            isActive || activeTab === 'profile'
                              ? 'text-white/80'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          Cập nhật họ tên, ảnh đại diện và tùy chọn cá nhân
                        </span>
                      </div>
                    </>
                  )}
                </NavLink>

                <NavLink
                  to="/settings/password"
                  className={({ isActive }) =>
                    `group flex items-start gap-3.5 p-3.5 rounded-2xl transition-all duration-150 cursor-pointer ${
                      isActive || activeTab === 'password'
                        ? 'bg-primary text-white shadow-md shadow-primary/25 font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                          isActive || activeTab === 'password'
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-primary/10 group-hover:text-primary'
                        }`}
                      >
                        <KeyRound className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block text-sm leading-tight font-bold">
                          Đổi mật khẩu
                        </span>
                        <span
                          className={`block text-xs mt-1 leading-normal ${
                            isActive || activeTab === 'password'
                              ? 'text-white/80'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          Thay đổi mật khẩu đăng nhập và tăng cường bảo mật
                        </span>
                      </div>
                    </>
                  )}
                </NavLink>
              </div>

              {/* Quick Links Card */}
              <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-gradient-to-br from-slate-50 to-slate-100/60 dark:from-slate-900/60 dark:to-slate-800/40 p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>Truy cập nhanh</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  {isHr ? (
                    <Link
                      to="/dashboard"
                      className="flex items-center justify-between p-2 rounded-xl text-slate-600 hover:text-primary hover:bg-white/80 dark:text-slate-400 dark:hover:text-primary-light dark:hover:bg-slate-800 transition"
                    >
                      <span>Bảng điều khiển Nhà tuyển dụng</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <Link
                      to="/my-cv"
                      className="flex items-center justify-between p-2 rounded-xl text-slate-600 hover:text-primary hover:bg-white/80 dark:text-slate-400 dark:hover:text-primary-light dark:hover:bg-slate-800 transition"
                    >
                      <span>Quản lý CV đã tải lên</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                  <Link
                    to="/messages"
                    className="flex items-center justify-between p-2 rounded-xl text-slate-600 hover:text-primary hover:bg-white/80 dark:text-slate-400 dark:hover:text-primary-light dark:hover:bg-slate-800 transition"
                  >
                    <span>Tin nhắn kết nối</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </aside>

            {/* Right Main Content (8 cols) */}
            <section className="lg:col-span-8 min-w-0">
              {children}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
