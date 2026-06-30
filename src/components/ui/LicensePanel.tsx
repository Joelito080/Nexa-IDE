import React from 'react'
import { useAppStore } from '../../store/appStore'
import { useAppModal } from './ModalDialog'

const FREE_LIMITS = { aiRequests: 20, templateUses: 5, extensionInstalls: 3 }
const BILLING_URL = import.meta.env.VITE_BILLING_URL || 'https://id-preview--6f13a148-826f-4dac-9293-32ae108cad18.lovable.app/#pricing'

export default function LicensePanel() {
  const licenseStatus = useAppStore((s) => s.licenseStatus)
  const licenseLoading = useAppStore((s) => s.licenseLoading)
  const licensePanelOpen = useAppStore((s) => s.licensePanelOpen)
  const setLicensePanelOpen = useAppStore((s) => s.setLicensePanelOpen)
  const setLicenseStatus = useAppStore((s) => s.setLicenseStatus)
  const setLicenseLoading = useAppStore((s) => s.setLicenseLoading)
  const addNotification = useAppStore((s) => s.addNotification)
  const { prompt, confirm } = useAppModal()

  if (!licensePanelOpen) return null

  const close = () => setLicensePanelOpen(false)

  const maskedKey = (key: string | null) => {
    if (!key) return '—'
    if (key.length <= 8) return '*'.repeat(Math.max(0, key.length - 4)) + key.slice(-4)
    return key.slice(0, 4) + '·'.repeat(6) + key.slice(-4)
  }

  const activate = async () => {
    const key = await prompt({ title: 'Enter license key', placeholder: 'PRO-XXXX-XXXX', confirmText: 'Activate', cancelText: 'Cancel' })
    if (!key) return
    setLicenseLoading(true)
    try {
      const res = await window.electronAPI?.license.activate(key)
      if (!res || (res as any).error) {
        addNotification(`Activation failed: ${(res as any).error ?? 'Invalid key'}`, 'error')
        return
      }
      setLicenseStatus(res as any)
      addNotification('License activated.', 'success')
    } catch (err) {
      addNotification('Activation failed.', 'error')
    } finally {
      setLicenseLoading(false)
    }
  }

  const refresh = async () => {
    setLicenseLoading(true)
    try {
      const res = await window.electronAPI?.license.refresh()
      if (!res || (res as any).error) {
        addNotification(`Refresh failed: ${(res as any).error ?? 'Unknown error'}`, 'error')
        return
      }
      setLicenseStatus(res as any)
      addNotification('License refreshed.', 'success')
    } catch (e) {
      addNotification('Refresh failed.', 'error')
    } finally {
      setLicenseLoading(false)
    }
  }

  const deactivate = async () => {
    const ok = await confirm({ title: 'Deactivate license?', message: 'This will remove the local license and revert to Free plan.', confirmText: 'Deactivate', cancelText: 'Cancel' })
    if (!ok) return
    setLicenseLoading(true)
    try {
      const res = await window.electronAPI?.license.deactivate()
      if (!res || (res as any).error) {
        addNotification(`Deactivation failed: ${(res as any).error ?? 'Unknown error'}`, 'error')
        return
      }
      setLicenseStatus(res as any)
      addNotification('License deactivated. Reverted to Free plan.', 'info')
    } catch (e) {
      addNotification('Deactivation failed.', 'error')
    } finally {
      setLicenseLoading(false)
    }
  }

  const upgrade = () => {
    const openUrl = async () => {
      const openPromise = window.electronAPI?.external.open(BILLING_URL)
      if (openPromise) {
        const success = await openPromise
        if (!success) {
          window.open(BILLING_URL, '_blank')
        }
      } else {
        window.open(BILLING_URL, '_blank')
      }
    }

    openUrl().catch(() => {
      addNotification('Unable to open billing page.', 'error')
    })
  }

  const usage = licenseStatus?.usage ?? { aiRequests: 0, templateUses: 0, extensionInstalls: 0 }
  const plan = licenseStatus?.plan ?? 'free'

  const aiLimit = plan === 'free' ? FREE_LIMITS.aiRequests : Infinity
  const templateLimit = plan === 'free' ? FREE_LIMITS.templateUses : Infinity
  const extensionLimit = plan === 'free' ? FREE_LIMITS.extensionInstalls : Infinity

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/70" style={{ zIndex: 9999 }}>
      <div className="w-[560px] rounded-2xl border border-white/10 bg-[#090b11] shadow-2xl">
        <div className="px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.32em] text-slate-500">License</p>
              <h2 className="mt-3 text-lg font-semibold text-white">License Management</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">Manage your license, view quotas and device binding.</p>
            </div>
            <div>
              <button onClick={close} className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:text-white">Close</button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-white/5 border border-white/6">
              <p className="text-[11px] text-slate-400">Current Plan</p>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{plan.toUpperCase()}</p>
                  <p className="text-[12px] text-slate-400">{licenseStatus?.isExpired ? 'Expired' : (licenseStatus?.activatedAt ? 'Active' : 'Inactive')}</p>
                </div>
                <div className="text-right text-[12px] text-slate-400">
                  <p>Device: {licenseStatus?.deviceId ? 'Bound' : 'Unbound'}</p>
                  <p>Verified: {licenseStatus?.verifiedAt ? new Date(licenseStatus.verifiedAt).toLocaleString() : '—'}</p>
                </div>
              </div>

              <div className="mt-3 text-[12px] text-slate-300">Key: {maskedKey(licenseStatus?.licenseKey ?? null)}</div>
            </div>

            <div className="p-4 rounded-lg bg-white/5 border border-white/6">
              <p className="text-[11px] text-slate-400">Usage (Window start: {licenseStatus?.usageWindowStart ? new Date(licenseStatus.usageWindowStart).toLocaleDateString() : '—'})</p>
              <div className="mt-2 text-[13px] text-white">
                <div>AI Requests: {usage.aiRequests} / {aiLimit === Infinity ? 'Unlimited' : aiLimit}</div>
                <div>Templates: {usage.templateUses} / {templateLimit === Infinity ? 'Unlimited' : templateLimit}</div>
                <div>Extensions: {usage.extensionInstalls} / {extensionLimit === Infinity ? 'Unlimited' : extensionLimit}</div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3 justify-end">
            <button onClick={activate} className="rounded-2xl bg-[#8b5cf6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7c3aed]">Activate License</button>
            <button onClick={refresh} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">Refresh License</button>
            <button onClick={deactivate} className="rounded-2xl border border-red-500 bg-white/5 px-4 py-2 text-sm text-red-400">Deactivate</button>
            <button onClick={upgrade} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">Upgrade</button>
          </div>
        </div>
      </div>
    </div>
  )
}
