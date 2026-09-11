import React, { useState, useEffect } from 'react';
import { MapPin, Check, X, AlertTriangle, Eye, ShieldCheck, Clock, User } from 'lucide-react';
import { Button } from './Button';
import { MachineLocationPicker } from './MachineLocationPicker';
import { useNotification } from '../../context/NotificationContext';
import { Machine } from '../../types';
import { api } from '../../services/api';

interface LocationProposal {
  id: string;
  integration_machine_id?: string;
  public_qr_token: string;
  ticket_id?: string;
  technician_id: string;
  technician_name: string;
  latitude: number;
  longitude: number;
  accuracy_meters?: number;
  captured_at: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
}

interface LocationProposalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  machines: Machine[];
  onProposalApproved: () => void;
}

export const LocationProposalsModal: React.FC<LocationProposalsModalProps> = ({
  isOpen,
  onClose,
  machines,
  onProposalApproved
}) => {
  const { showToast } = useNotification();
  const [proposals, setProposals] = useState<LocationProposal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [viewingProposal, setViewingProposal] = useState<LocationProposal | null>(null);
  const [rejectingProposal, setRejectingProposal] = useState<LocationProposal | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchProposals = async () => {
    setIsLoading(true);
    try {
      const data = await api.getPendingLocationProposals();
      setProposals(data.proposals || []);
    } catch (err: any) {
      setProposals([]);
      showToast(
        'تعذر تحميل المقترحات',
        err.message || 'فشل تحميل مقترحات مواقع الماكينات',
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchProposals();
    }
  }, [isOpen]);

  const handleApprove = async (proposal: LocationProposal) => {
    setProcessingId(proposal.id);
    try {
      await api.approveLocationProposal(proposal.id);

      showToast('تم الاعتماد', 'تم اعتماد إحداثيات الماكينة بنجاح وتحديث السجل الرسمي.', 'success');
      await fetchProposals();
      onProposalApproved();
    } catch (err: any) {
      showToast('خطأ', err.message || 'فشل اعتماد مقترح الموقع', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectingProposal) return;
    setProcessingId(rejectingProposal.id);
    try {
      await api.rejectLocationProposal(
        rejectingProposal.id,
        rejectionReason || 'موقع غير دقيق أو لم يتم التحقق منه ميدانياً'
      );

      showToast('تم الرفض', 'تم رفض مقترح الموقع وتسجيل سبب الرفض في سجل التدقيق.', 'info');
      setRejectingProposal(null);
      setRejectionReason('');
      await fetchProposals();
    } catch (err: any) {
      showToast('خطأ', err.message || 'فشل رفض مقترح الموقع', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  مقترحات مواقع الماكينات المرفوعة من الفنيين (Location Proposals Review)
                </h3>
                <p className="text-xs text-slate-400">
                  مراجعة واعتماد إحداثيات GPS المرفوعة من الفنيين أثناء المسح الميداني دون التعديل التلقائي
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Proposals Table */}
          <div className="p-5 flex-1 overflow-y-auto space-y-4">
            {isLoading ? (
              <div className="py-12 text-center text-xs text-slate-400">جاري تحميل المقترحات المعلقة...</div>
            ) : proposals.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto opacity-75" />
                <p className="font-semibold text-slate-300">لا توجد مقترحات مواقع معلقة حالياً</p>
                <p className="text-[11px] text-slate-500">
                  عند قيام الفني بمسح رمز QR لماكينة غير محددة الموقع الجغرافي، سيظهر المقترح هنا للمراجعة والاعتماد.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
                {proposals.map((prop) => {
                  const mch = machines.find(
                    (m) =>
                      m.publicQrToken === prop.public_qr_token ||
                      m.id === prop.integration_machine_id ||
                      m.machineNumber === prop.integration_machine_id
                  );
                  const hasOfficialCoords = mch && typeof mch.latitude === 'number' && typeof mch.longitude === 'number';

                  return (
                    <div key={prop.id} className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-sm text-slate-100">
                            {mch ? `ماكينة: ${mch.machineNumber}` : `QR: ${prop.public_qr_token}`}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            PENDING APPROVAL
                          </span>
                          {prop.accuracy_meters && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-500/10 text-blue-300 border border-blue-500/20">
                              دقة الـ GPS: ±{prop.accuracy_meters}م
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-400 pt-1">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-500" />
                            <span>الفني: <strong className="text-slate-200">{prop.technician_name}</strong> ({prop.technician_id})</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            <span>التوقيت: <span className="font-mono text-slate-300">{new Date(prop.captured_at).toLocaleString('ar-SA')}</span></span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono pt-1">
                          <div className="p-2 rounded bg-slate-900 border border-slate-800">
                            <span className="text-[10px] text-slate-500 block uppercase">الموقع المعتمد حالياً</span>
                            {hasOfficialCoords ? (
                              <span className="text-emerald-400 font-semibold">{mch.latitude?.toFixed(5)}, {mch.longitude?.toFixed(5)}</span>
                            ) : (
                              <span className="text-amber-400 font-semibold">غير محدد / Not Configured</span>
                            )}
                          </div>

                          <div className="p-2 rounded bg-slate-900 border border-slate-800">
                            <span className="text-[10px] text-slate-500 block uppercase">الموقع المقترح من الفني</span>
                            <span className="text-blue-400 font-semibold">{prop.latitude.toFixed(5)}, {prop.longitude.toFixed(5)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-stretch md:self-auto shrink-0 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          icon={Eye}
                          onClick={() => setViewingProposal(prop)}
                        >
                          معاينة الخريطة
                        </Button>

                        <Button
                          variant="danger"
                          size="sm"
                          icon={X}
                          disabled={processingId === prop.id}
                          onClick={() => setRejectingProposal(prop)}
                        >
                          رفض
                        </Button>

                        <Button
                          variant="primary"
                          size="sm"
                          icon={Check}
                          isLoading={processingId === prop.id}
                          onClick={() => handleApprove(prop)}
                        >
                          اعتماد الموقع
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-800 flex justify-end bg-slate-950/70">
            <Button variant="outline" size="sm" onClick={onClose}>
              إغلاق
            </Button>
          </div>
        </div>
      </div>

      {/* Map Preview Modal */}
      {viewingProposal && (
        <MachineLocationPicker
          isOpen={!!viewingProposal}
          onClose={() => setViewingProposal(null)}
          onConfirm={() => {}}
          initialLatitude={
            machines.find((m) => m.publicQrToken === viewingProposal.public_qr_token)?.latitude || null
          }
          initialLongitude={
            machines.find((m) => m.publicQrToken === viewingProposal.public_qr_token)?.longitude || null
          }
          machineTitle={`ماكينة ${viewingProposal.public_qr_token}`}
          isReadOnly={true}
          proposedCoordinates={{
            latitude: viewingProposal.latitude,
            longitude: viewingProposal.longitude,
            technicianName: viewingProposal.technician_name,
            capturedAt: viewingProposal.captured_at
          }}
        />
      )}

      {/* Rejection Modal */}
      {rejectingProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
              <h4 className="font-bold text-slate-100">تأكيد رفض مقترح الموقع</h4>
            </div>
            <p className="text-xs text-slate-300">
              يرجى إدخال سبب رفض مقترح الإحداثيات المرفوع من الفني ({rejectingProposal.technician_name}) ليتم حفظه في سجل التدقيق الأمني:
            </p>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="مثال: الإحداثيات بعيدة عن المبنى الفعلي، يرجى إعادة المسح عند واجهة الماكينة..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-rose-500 resize-none"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRejectingProposal(null);
                  setRejectionReason('');
                }}
              >
                إلغاء
              </Button>
              <Button
                variant="danger"
                size="sm"
                isLoading={processingId === rejectingProposal.id}
                onClick={handleReject}
              >
                تأكيد الرفض
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
