import React, { useState, useEffect, useCallback } from 'react';
import {
  Tag,
  Search,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { adminApi, type AdminSkillItem } from '../../../lib/adminApi';

interface SkillsTabProps {
  skills?: AdminSkillItem[];
  isLoading?: boolean;
  onCreateSkill?: (data: { name: string; category?: string; description?: string }) => Promise<void>;
  onUpdateSkill?: (id: string, data: { name?: string; category?: string; description?: string }) => Promise<void>;
  onDeleteSkill?: (id: string) => Promise<void>;
}

export const SkillsTab: React.FC<SkillsTabProps> = ({
  skills: initialSkills,
  isLoading: initialLoading,
  onCreateSkill: externalCreate,
  onUpdateSkill: externalUpdate,
  onDeleteSkill: externalDelete,
}) => {
  const { accessToken } = useAuth();
  const { success, error } = useToast();

  const [skills, setSkills] = useState<AdminSkillItem[]>(initialSkills || []);
  const [isLoading, setIsLoading] = useState<boolean>(
    initialLoading !== undefined ? initialLoading : !initialSkills,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchSkills = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await adminApi.getSkills();
      setSkills(data);
    } catch (err: any) {
      console.error('Failed to load skills', err);
      error(err.message || 'Không thể tải từ điển kỹ năng');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [error]);

  useEffect(() => {
    if (initialSkills !== undefined) {
      setSkills(initialSkills);
      return;
    }
    fetchSkills();
  }, [initialSkills, fetchSkills]);

  const handleCreateSkill = async (data: { name: string; category?: string; description?: string }) => {
    if (externalCreate) {
      await externalCreate(data);
      return;
    }
    if (!accessToken) return;
    try {
      await adminApi.createSkill(accessToken, data);
      success('Đã thêm kỹ năng mới vào từ điển');
      fetchSkills();
    } catch (err: any) {
      error(err.message || 'Thêm kỹ năng thất bại');
      throw err;
    }
  };

  const handleUpdateSkill = async (
    id: string,
    data: { name?: string; category?: string; description?: string },
  ) => {
    if (externalUpdate) {
      await externalUpdate(id, data);
      return;
    }
    if (!accessToken) return;
    try {
      await adminApi.updateSkill(accessToken, id, data);
      success('Đã cập nhật kỹ năng');
      fetchSkills();
    } catch (err: any) {
      error(err.message || 'Cập nhật kỹ năng thất bại');
      throw err;
    }
  };

  const handleDeleteSkill = async (id: string) => {
    if (externalDelete) {
      await externalDelete(id);
      return;
    }
    if (!accessToken) return;
    try {
      await adminApi.deleteSkill(accessToken, id);
      success('Đã xóa kỹ năng khỏi hệ thống');
      fetchSkills();
    } catch (err: any) {
      error(err.message || 'Xóa kỹ năng thất bại');
    }
  };

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchSkills();
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<AdminSkillItem | null>(null);
  const [formData, setFormData] = useState({ name: '', category: '', description: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Extract unique categories
  const categories = Array.from(
    new Set(skills.map((s) => s.category).filter(Boolean)),
  ) as string[];

  const filteredSkills = skills.filter((s) => {
    const matchSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.category && s.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (s.description && s.description.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchCategory =
      categoryFilter === 'ALL' ? true : s.category === categoryFilter;

    return matchSearch && matchCategory;
  });

  const handleOpenCreateModal = () => {
    setEditingSkill(null);
    setFormData({ name: '', category: 'Công nghệ thông tin', description: '' });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (skill: AdminSkillItem) => {
    setEditingSkill(skill);
    setFormData({
      name: skill.name,
      category: skill.category || '',
      description: skill.description || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      if (editingSkill) {
        await handleUpdateSkill(editingSkill._id, formData);
      } else {
        await handleCreateSkill(formData);
      }
      setIsModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading && skills.length === 0) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
        <div className="h-96 rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên kỹ năng, danh mục, mô tả..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
        </div>

        {/* Categories Filter, Refresh & Add Button */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <option value="ALL">Tất cả danh mục ({skills.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Thêm Kỹ Năng
          </button>
        </div>
      </div>

      {/* Skills Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <th className="py-3.5 px-4 font-bold">Tên kỹ năng (Skill)</th>
                <th className="py-3.5 px-4 font-bold">Danh mục</th>
                <th className="py-3.5 px-4 font-bold">Mô tả</th>
                <th className="py-3.5 px-4 font-bold">Ngày tạo</th>
                <th className="py-3.5 px-4 text-right font-bold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSkills.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    Không tìm thấy kỹ năng nào phù hợp
                  </td>
                </tr>
              ) : (
                filteredSkills.map((skill) => (
                  <tr
                    key={skill._id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light">
                          <Tag className="h-3.5 w-3.5" />
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {skill.name}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {skill.category || 'Chung'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                      {skill.description || '—'}
                    </td>

                    <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                      {new Date(skill.createdAt).toLocaleDateString('vi-VN')}
                    </td>

                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(skill)}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer"
                      >
                        <Edit2 className="h-3 w-3" />
                        Sửa
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Bạn có chắc muốn xóa kỹ năng "${skill.name}"?`)) {
                            handleDeleteSkill(skill._id);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 transition cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add / Edit Skill */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              {editingSkill ? 'Chỉnh Sửa Kỹ Năng' : 'Thêm Kỹ Năng Chuẩn Mới'}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Định nghĩa kỹ năng dùng chung cho hệ thống gợi ý và tìm kiếm
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tên kỹ năng *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="VD: React.js, NestJS, Docker..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Danh mục nhóm (Category)
                </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="VD: Frontend, Backend, DevOps, Design..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mô tả chi tiết
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Mô tả tóm tắt kỹ năng hoặc từ khóa tương đương..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl px-4 py-2 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-primary px-5 py-2 font-bold text-white shadow-md shadow-primary/25 hover:bg-primary-dark disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Đang lưu...' : editingSkill ? 'Lưu Thay Đổi' : 'Tạo Kỹ Năng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
