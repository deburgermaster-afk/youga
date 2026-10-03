import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useDesktop } from '@/hooks/use-media'

// Bottom drawer on phones, side sheet on larger screens.
export function Panel({
  open, onOpenChange, title, description, children, footer,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const desktop = useDesktop()

  if (desktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl">
          <SheetHeader className="border-b p-5 pr-12">
            <SheetTitle className="break-all text-base leading-snug">{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
          {footer && <SheetFooter className="border-t p-4">{footer}</SheetFooter>}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[94dvh]">
        <DrawerHeader className="border-b px-4 pb-3 text-left">
          <DrawerTitle className="break-all text-base leading-snug">{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <DrawerFooter className="border-t px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</DrawerFooter>}
      </DrawerContent>
    </Drawer>
  )
}
