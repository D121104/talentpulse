import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

export interface ValidationFieldError {
  field: string;
  messages: string[];
}

export interface ValidationErrorResponse {
  message: string;
  errors: ValidationFieldError[];
}

const FIELD_LABELS: Record<string, string> = {
  contentVersion: 'Phiên bản hồ sơ',
  expectedProfileVersion: 'Phiên bản hồ sơ dự kiến',
  fullName: 'Họ và tên',
  email: 'Email',
  phone: 'Số điện thoại',
  link: 'Liên kết',
  address: 'Địa chỉ',
  avatar: 'Ảnh đại diện',
  headline: 'Tiêu đề nghề nghiệp',
  objective: 'Mục tiêu nghề nghiệp',
  careerObjective: 'Mục tiêu nghề nghiệp',
  templateType: 'Mẫu CV',
  locale: 'Ngôn ngữ',
  jobId: 'Công việc',
};

const CONSTRAINT_MESSAGES: Record<string, string> = {
  isEmail: 'Email không hợp lệ',
  isEnum: 'Giá trị không hợp lệ',
  isInt: 'Giá trị phải là số nguyên',
  isArray: 'Giá trị phải là danh sách',
  isString: 'Giá trị phải là chuỗi',
  isUUID: 'Giá trị định danh không hợp lệ',
  isNotEmpty: 'Trường này không được để trống',
  isDefined: 'Trường này là bắt buộc',
  min: 'Giá trị nhỏ hơn mức cho phép',
  max: 'Giá trị lớn hơn mức cho phép',
  minLength: 'Nội dung ngắn hơn mức cho phép',
  maxLength: 'Nội dung dài hơn mức cho phép',
  length: 'Độ dài nội dung không hợp lệ',
  arrayMaxSize: 'Danh sách có quá nhiều phần tử',
  matches: 'Định dạng không hợp lệ',
  whitelistValidation: 'Trường này không được phép cập nhật',
  profileAggregateLimit: 'Hồ sơ nghề nghiệp vượt quá giới hạn cho phép',
};

function formatPath(parent: string, property: string): string {
  if (!parent) return property;
  return /^\d+$/.test(property)
    ? `${parent}[${property}]`
    : `${parent}.${property}`;
}

function fieldLabel(path: string): string {
  const property =
    path
      .split('.')
      .pop()
      ?.replace(/\[\d+\]$/, '') || path;
  return FIELD_LABELS[property] || 'Trường dữ liệu';
}

function messageForConstraint(
  constraint: string,
  error: ValidationError,
  path: string,
): string {
  if (error.value === undefined && constraint !== 'whitelistValidation') {
    return `${fieldLabel(path)} là bắt buộc`;
  }
  return CONSTRAINT_MESSAGES[constraint] || `${fieldLabel(path)} không hợp lệ`;
}

/**
 * Converts class-validator internals into a stable, client-safe response.
 * Values and raw constraint strings are deliberately never returned.
 */
export function normalizeValidationErrors(
  errors: ValidationError[],
): ValidationErrorResponse {
  const byField = new Map<string, Set<string>>();

  const visit = (error: ValidationError, parent = ''): void => {
    const path = formatPath(parent, error.property);
    if (error.constraints) {
      const messages = byField.get(path) || new Set<string>();
      Object.keys(error.constraints).forEach((constraint) =>
        messages.add(messageForConstraint(constraint, error, path)),
      );
      byField.set(path, messages);
    }
    error.children?.forEach((child) => visit(child, path));
  };

  errors.forEach((error) => visit(error));
  return {
    message: 'Dữ liệu gửi lên không hợp lệ',
    errors: Array.from(byField, ([field, messages]) => ({
      field,
      messages: Array.from(messages),
    })),
  };
}

export function createValidationException(
  errors: ValidationError[],
): BadRequestException {
  return new BadRequestException(normalizeValidationErrors(errors));
}
