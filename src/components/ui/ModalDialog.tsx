import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore, ModalState } from '../../store/appStore'

export function useAppModal() {
  const openModal = useAppStore((state) => state.openModal)

  return {
    prompt: (options: {
      title: string
      message?: string
      placeholder?: string
      defaultValue?: string
      confirmText?: string
      cancelText?: string
    }) => {
      return new Promise<string | null>((resolve) => {
        openModal({
          id: `modal-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: 'prompt',
          title: options.title,
          message: options.message,
          placeholder: options.placeholder,
          defaultValue: options.defaultValue,
          confirmText: options.confirmText ?? 'Save',
          cancelText: options.cancelText ?? 'Cancel',
          resolve,
        })
      })
    },
    confirm: (options: {
      title: string
      message?: string
      confirmText?: string
      cancelText?: string
    }) => {
      return new Promise<boolean>((resolve) => {
        openModal({
          id: `modal-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: 'confirm',
          title: options.title,
          message: options.message,
          confirmText: options.confirmText ?? 'Confirm',
          cancelText: options.cancelText ?? 'Cancel',
          resolve,
        })
      })
    },
  }
}

export default function ModalDialog() {
  const modal = useAppStore((state) => state.modal)
  const closeModal = useAppStore((state) => state.closeModal)
  const [inputValue, setInputValue] = useState('')

  useEffect(() => {
    if (modal?.type === 'prompt') {
      setInputValue(modal.defaultValue ?? '')
    } else {
      setInputValue('')
    }
  }, [modal])

  useEffect(() => {
    if (!modal) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleClose()
      }
      if (event.key === 'Enter' && modal.type === 'prompt') {
        event.preventDefault()
        handleConfirm()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [modal])

  if (!modal) return null

  const handleClose = () => {
    if (modal.type === 'prompt') {
      modal.resolve(null)
    } else {
      modal.resolve(false)
    }
    closeModal()
  }

  const handleConfirm = () => {
    if (modal.type === 'prompt') {
      modal.resolve(inputValue)
    } else {
      modal.resolve(true)
    }
    closeModal()
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.98, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.98, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          className="w-[420px] rounded-3xl border border-white/10 bg-[#090b11] shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="px-6 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.32em] text-slate-500">
                  {modal.type === 'prompt' ? 'Input required' : 'Confirmation'}
                </p>
                <h2 className="mt-3 text-lg font-semibold text-white">{modal.title}</h2>
                {modal.message && (
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {modal.message}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {modal.type === 'prompt' && (
              <div className="mt-5">
                <input
                  autoFocus
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  placeholder={modal.placeholder ?? ''}
                  className="w-full rounded-2xl border border-white/10 bg-[#02040a] px-4 py-3 text-sm text-white outline-none ring-0 transition focus:border-[#8b5cf6]"
                />
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
              >
                {modal.cancelText}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="rounded-2xl bg-[#8b5cf6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7c3aed]"
              >
                {modal.confirmText}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
