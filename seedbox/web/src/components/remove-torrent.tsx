import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { api, type Torrent } from '@/lib/api'

export function RemoveTorrent({ t, open, onOpenChange, onDone }: {
  t: Torrent | null; open: boolean; onOpenChange: (o: boolean) => void; onDone?: () => void
}) {
  const remove = async (files: boolean) => {
    if (!t) return
    try {
      await api.remove(t.infoHash, files)
      toast.success(files ? 'Torrent and files deleted' : 'Torrent removed, files kept')
      onDone?.()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove torrent?</AlertDialogTitle>
          <AlertDialogDescription className="break-all">{t?.name}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="outline" onClick={() => remove(false)}>Keep files</AlertDialogAction>
          <AlertDialogAction variant="destructive" onClick={() => remove(true)}>Delete files</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
