const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'src', 'pages', 'billing', 'NewSalePage.tsx');
let content = fs.readFileSync(targetFile, 'utf8');

// 1. Add Dialog imports
content = content.replace(
  "import { ScrollArea } from '@/components/ui/scroll-area'",
  "import { ScrollArea } from '@/components/ui/scroll-area'\nimport {\n  Dialog,\n  DialogContent,\n  DialogHeader,\n  DialogTitle,\n} from '@/components/ui/dialog'"
);

// 2. Rename mockProducts, mockBatches, mockCustomers
content = content.replace(/mockProducts/g, 'products');
content = content.replace(/mockBatches/g, 'batches');
content = content.replace(/mockCustomers/g, 'customers');

// 3. Make the page completely non-scrollable. Change h-[calc(100vh-4.5rem)] to overflow-hidden h-full. Add it.
content = content.replace(
  '<div className="flex flex-col h-[calc(100vh-4.5rem)]">',
  '<div className="flex flex-col h-full overflow-hidden absolute inset-0 p-4 pb-0 bg-background/50">'
);

// 4. Hero search visibility
content = content.replace(
  "'w-full h-10 rounded-xl border border-border/60 bg-background pl-9 pr-4 text-sm',\n                  'placeholder:text-muted-foreground/40',\n                  'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50'",
  "'w-full h-14 rounded-xl border-2 border-primary/30 bg-background pl-10 pr-4 text-base font-medium shadow-md',\n                  'placeholder:text-muted-foreground/50',\n                  'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary'"
);
content = content.replace(
  '<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />',
  '<Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-primary/60" />'
);

// 5. Add new customer modal state
content = content.replace(
  "const [customerSearch, setCustomerSearch] = useState('')",
  "const [customerSearch, setCustomerSearch] = useState('')\n  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false)\n  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', type: 'walk-in' as any })"
);

// 6. Connect Add New Customer button
const oldAddCustBtn = `<button
                        type="button"
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-primary hover:bg-primary/5 transition-colors"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Add New Customer
                      </button>`;
const newAddCustBtn = `<Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setShowCustomerDropdown(false);
                          setShowNewCustomerModal(true);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-primary hover:bg-primary/5 transition-colors"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Add New Customer
                      </Button>`;
content = content.replace(oldAddCustBtn, newAddCustBtn);

// 7. Move Add Row button to top
// Old table container start
const tableContainerStart = `<Card className="flex-1 flex flex-col overflow-hidden">
              <CardContent className="p-0 flex-1 flex flex-col">
                <ScrollArea className="flex-1">`;
const newTableContainerStart = `<Card className="flex-1 flex flex-col overflow-hidden h-full border-border/50">
              <div className="flex items-center justify-between border-b border-border/40 px-3 py-2 bg-muted/10 shrink-0">
                <div className="text-sm font-semibold text-muted-foreground">Order Items</div>
                <div className="flex items-center gap-3">
                  {activeItemCount > 0 && (
                    <span className="text-[11px] font-medium text-muted-foreground bg-background px-2 py-0.5 rounded-full border border-border/50 shadow-sm">
                      {activeItemCount} item{activeItemCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={addItem}
                    className="gap-1.5 text-xs h-8 shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Item
                    <kbd className="ml-1 hidden rounded border border-primary-foreground/30 bg-primary-foreground/10 px-1 text-[9px] font-mono sm:inline opacity-80">Alt+N</kbd>
                  </Button>
                </div>
              </div>
              <CardContent className="p-0 flex-1 flex flex-col h-full min-h-0">
                <ScrollArea className="flex-1 h-full">`;
content = content.replace(tableContainerStart, newTableContainerStart);

// Remove the old add row bottom bar
const oldBottomBar = `{/* Add row + item count bar */}
                <div className="flex items-center justify-between border-t border-border/40 px-3 py-1.5 bg-muted/10">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addItem}
                    className="text-primary gap-1 text-xs h-7"
                  >
                    <Plus className="h-3 w-3" />
                    Add Row
                    <kbd className="ml-1 hidden rounded border border-border/40 bg-muted/30 px-1 text-[9px] font-mono text-muted-foreground sm:inline">Alt+N</kbd>
                  </Button>
                  {activeItemCount > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {activeItemCount} item{activeItemCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>`;
content = content.replace(oldBottomBar, '');

// Fix wrapper div flex issue
content = content.replace(
  '<div className="flex gap-3 flex-1 min-h-0">',
  '<div className="flex gap-3 flex-1 min-h-0 h-full overflow-hidden pb-4">'
);

// Add the Customer Dialog JSX to the very end before closing main div
const dialogJsx = `

        {/* Customer Form Modal */}
        <Dialog open={showNewCustomerModal} onOpenChange={setShowNewCustomerModal}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</label>
                <Input
                  value={newCustomer.name}
                  onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                  placeholder="John Doe"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phone</label>
                <Input
                  value={newCustomer.phone}
                  onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                  placeholder="9876543210"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer Type</label>
                <select 
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                  value={newCustomer.type}
                  onChange={e => setNewCustomer({...newCustomer, type: e.target.value as any})}
                >
                  <option value="walk-in">Walk-in</option>
                  <option value="regular">Regular</option>
                  <option value="hospital">Hospital</option>
                  <option value="wholesale">Wholesale</option>
                  <option value="doctor">Doctor</option>
                </select>
              </div>
              <Button 
                onClick={async () => {
                  try {
                    await api.post('/customers', newCustomer);
                    await fetchMasterData(); // refresh list
                    alert('Customer added successfully!');
                    setShowNewCustomerModal(false);
                    // attempt to select newly created customer by name match
                  } catch (e) {
                    console.error(e);
                    alert('Failed to save customer');
                  }
                }}
                className="w-full mt-2"
                disabled={!newCustomer.name || !newCustomer.phone}
              >
                Save Customer
              </Button>
            </div>
          </DialogContent>
        </Dialog>`;

content = content.replace("</TooltipProvider>", dialogJsx + "\n    </TooltipProvider>");

fs.writeFileSync(targetFile, content);
console.log('Refactoring complete');
