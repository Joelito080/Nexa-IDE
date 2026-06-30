import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, Info, Bell, X } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

const notificationIcons = {
  success: <CheckCircle2 size={16} className="text-emerald-400" />,
  error: <AlertTriangle size={16} className="text-rose-400" />,
  info: <Info size={16} className="text-sky-400" />,
  warning: <Bell size={16} className="text-amber-400" />,
}

export default function NotificationCenter() {
  const notifications = useAppStore((state) => state.notifications)
  const removeNotification = useAppStore((state) => state.removeNotification)

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-sm">
      <AnimatePresence initial={false}>
        {notifications.map((notification) => (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="pointer-events-auto rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-[0_22px_60px_rgba(0,0,0,0.14)] backdrop-blur-sm"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-white/5">
                {notificationIcons[notification.type]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    {notification.type}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeNotification(notification.id)}
                    className="text-slate-400 transition hover:text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-100 break-words">
                  {notification.message}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
