import React from 'react';
import { Badge, BadgeVariant } from './Badge';
import { useLanguage } from '../../context/LanguageContext';
import { MachineStatus, TicketStatus, TicketPriority, DataQualityStatus, TechnicianStatus, PartRequestStatus } from '../../types';

interface StatusBadgeProps {
  type: 'machine' | 'ticket' | 'priority' | 'quality' | 'dataQuality' | 'technician' | 'part_request';
  status: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ type, status, className }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  let variant: BadgeVariant = 'default';
  let label = status;

  if (type === 'machine') {
    switch (status as MachineStatus) {
      case 'OPERATIONAL':
        variant = 'success';
        label = isAr ? 'جاهزة للعمل' : 'Operational';
        break;
      case 'WARNING':
        variant = 'warning';
        label = isAr ? 'تحذير تشغيلي' : 'Warning';
        break;
      case 'UNDER_MAINTENANCE':
        variant = 'info';
        label = isAr ? 'تحت الصيانة' : 'Under Maintenance';
        break;
      case 'OUT_OF_SERVICE':
        variant = 'danger';
        label = isAr ? 'خارج الخدمة' : 'Out of Service';
        break;
      case 'RELOCATING':
        variant = 'purple';
        label = isAr ? 'قيد النقل' : 'Relocating';
        break;
      case 'DECOMMISSIONED':
        variant = 'default';
        label = isAr ? 'مستبعدة' : 'Decommissioned';
        break;
    }
  } else if (type === 'ticket') {
    switch (status as TicketStatus) {
      case 'NEW':
        variant = 'primary';
        label = isAr ? 'جديدة' : 'New';
        break;
      case 'ASSIGNED':
        variant = 'info';
        label = isAr ? 'معينة لفني' : 'Assigned';
        break;
      case 'IN_PROGRESS':
        variant = 'warning';
        label = isAr ? 'قيد المعالجة' : 'In Progress';
        break;
      case 'WAITING_FOR_PART':
        variant = 'purple';
        label = isAr ? 'بانتظار قطع غيار' : 'Waiting for Part';
        break;
      case 'RESOLVED':
        variant = 'success';
        label = isAr ? 'تم الحل' : 'Resolved';
        break;
      case 'CLOSED':
        variant = 'default';
        label = isAr ? 'مغلقة' : 'Closed';
        break;
      case 'CANCELLED':
        variant = 'default';
        label = isAr ? 'ملغاة' : 'Cancelled';
        break;
    }
  } else if (type === 'priority') {
    switch (status as TicketPriority) {
      case 'CRITICAL':
        variant = 'danger';
        label = isAr ? 'حرج جداً' : 'Critical';
        break;
      case 'HIGH':
        variant = 'warning';
        label = isAr ? 'مرتفع' : 'High';
        break;
      case 'MEDIUM':
        variant = 'primary';
        label = isAr ? 'متوسط' : 'Medium';
        break;
      case 'LOW':
        variant = 'default';
        label = isAr ? 'منخفض' : 'Low';
        break;
    }
  } else if (type === 'quality' || type === 'dataQuality') {
    switch (status as DataQualityStatus) {
      case 'VALID':
        variant = 'success';
        label = isAr ? 'سليم ومكتمل' : 'Valid';
        break;
      case 'REVIEW_REQUIRED':
        variant = 'warning';
        label = isAr ? 'يتطلب مراجعة' : 'Review Required';
        break;
      case 'INVALID':
        variant = 'danger';
        label = isAr ? 'غير مكتمل' : 'Invalid';
        break;
    }
  } else if (type === 'technician') {
    switch (status as TechnicianStatus) {
      case 'AVAILABLE':
        variant = 'success';
        label = isAr ? 'متاح للعمل' : 'Available';
        break;
      case 'BUSY':
        variant = 'warning';
        label = isAr ? 'مشغول بمهمة' : 'Busy';
        break;
      case 'ON_LEAVE':
        variant = 'default';
        label = isAr ? 'في إجازة' : 'On Leave';
        break;
      case 'INACTIVE':
        variant = 'danger';
        label = isAr ? 'غير نشط' : 'Inactive';
        break;
    }
  } else if (type === 'part_request') {
    switch (status as PartRequestStatus) {
      case 'REQUESTED':
        variant = 'primary';
        label = isAr ? 'تم الطلب' : 'Requested';
        break;
      case 'APPROVED':
        variant = 'info';
        label = isAr ? 'تمت الموافقة' : 'Approved';
        break;
      case 'ISSUED':
        variant = 'success';
        label = isAr ? 'تم الصرف' : 'Issued';
        break;
      case 'REJECTED':
        variant = 'danger';
        label = isAr ? 'مرفوض' : 'Rejected';
        break;
      case 'CANCELLED':
        variant = 'default';
        label = isAr ? 'ملغي' : 'Cancelled';
        break;
    }
  }

  return (
    <Badge variant={variant} dot={type === 'machine' || type === 'ticket' || type === 'technician'} className={className}>
      {label}
    </Badge>
  );
};
