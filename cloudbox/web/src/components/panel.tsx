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
    // repositionInputs off: on iPhone, the drawer's own keyboard handling
    // shoved the sheet off the top of the screen. iOS scrolls the input into view itself.
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)]">
        <DrawerHeader className="border-b px-4 pb-3 text-left">
          <DrawerTitle className="break-all text-base leading-snug">{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
        {footer && <DrawerFooter className="border-t px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</DrawerFooter>}
      </DrawerContent>
    </Drawer>
  )
}
