import { useState } from 'react';
import { useFarm } from '@/contexts/FarmContext';
import type { FeedSetting } from '@/types/farm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Settings, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const BRAND_OPTIONS = ['Nova', 'Magnum', 'Epol', 'Meadow', 'Afgri', 'Spesfeed', 'Pennville'];
const LOW_STOCK_THRESHOLD = 5;

export default function FeedSettingsPage() {
  const { feedSettings, setFeedSettings } = useFarm();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ brand: '', feedType: '' as string, pricePerBag: '', bagsPerHundredChickens: '', stockBags: '' });
  const [brandFilter, setBrandFilter] = useState<string>('all');

  const resetForm = () => setForm({ brand: '', feedType: '', pricePerBag: '', bagsPerHundredChickens: '', stockBags: '' });

  const addSetting = () => {
    if (!form.brand || !form.feedType || !form.pricePerBag || !form.bagsPerHundredChickens || !form.stockBags) return;
    const setting: FeedSetting = {
      id: crypto.randomUUID(),
      brand: form.brand,
      feedType: form.feedType as FeedSetting['feedType'],
      pricePerBag: parseFloat(form.pricePerBag),
      bagsPerHundredChickens: parseFloat(form.bagsPerHundredChickens),
      stockBags: parseInt(form.stockBags),
    };
    setFeedSettings(prev => [...prev, setting]);
    resetForm();
    setOpen(false);
  };

  const startEdit = (s: FeedSetting) => {
    setEditId(s.id);
    setForm({ brand: s.brand, feedType: s.feedType, pricePerBag: String(s.pricePerBag), bagsPerHundredChickens: String(s.bagsPerHundredChickens), stockBags: String(s.stockBags || 0) });
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!editId || !form.brand || !form.feedType) return;
    setFeedSettings(prev => prev.map(s => s.id !== editId ? s : {
      ...s,
      brand: form.brand,
      feedType: form.feedType as FeedSetting['feedType'],
      pricePerBag: parseFloat(form.pricePerBag) || 0,
      bagsPerHundredChickens: parseFloat(form.bagsPerHundredChickens) || 0,
      stockBags: parseInt(form.stockBags) || 0,
    }));
    resetForm();
    setEditId(null);
    setEditOpen(false);
  };

  const deleteSetting = (id: string) => setFeedSettings(prev => prev.filter(s => s.id !== id));

  const filteredSettings = brandFilter === 'all' ? feedSettings : feedSettings.filter(s => s.brand === brandFilter);

  const grouped = ['Starter', 'Grower', 'Finisher'].map(type => ({
    type,
    settings: filteredSettings.filter(s => s.feedType === type),
  }));

  const formFields = (
    <div className="space-y-4 pt-2">
      <div>
        <Label>Brand Name</Label>
        <Select value={form.brand} onValueChange={v => setForm(f => ({ ...f, brand: v }))}>
          <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
          <SelectContent>
            {BRAND_OPTIONS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Feed Type</Label>
        <Select value={form.feedType} onValueChange={v => setForm(f => ({ ...f, feedType: v }))}>
          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Starter">Starter</SelectItem>
            <SelectItem value="Grower">Grower</SelectItem>
            <SelectItem value="Finisher">Finisher</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label>Price per Bag (R)</Label><Input type="number" placeholder="350" value={form.pricePerBag} onChange={e => setForm(f => ({ ...f, pricePerBag: e.target.value }))} /></div>
      <div><Label>Bags per 100 Chickens</Label><Input type="number" step="0.1" placeholder="1" value={form.bagsPerHundredChickens} onChange={e => setForm(f => ({ ...f, bagsPerHundredChickens: e.target.value }))} /></div>
      <div><Label>Number of Bags in Stock</Label><Input type="number" placeholder="50" value={form.stockBags} onChange={e => setForm(f => ({ ...f, stockBags: e.target.value }))} /></div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-muted-foreground">Configure feed brands, prices, stock, and usage ratios</p>
          <p className="text-xs text-muted-foreground/70 mt-1">⚠️ Feed settings must be configured before creating batches</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {BRAND_OPTIONS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Feed Brand</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Feed Brand</DialogTitle></DialogHeader>
              {formFields}
              <Button className="w-full" onClick={addSetting}>Add Feed Setting</Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) { resetForm(); setEditId(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Feed Setting</DialogTitle></DialogHeader>
          {formFields}
          <Button className="w-full" onClick={saveEdit}>Save Changes</Button>
        </DialogContent>
      </Dialog>

      {/* Stock Overview Cards */}
      {feedSettings.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {feedSettings.map(s => {
            const isLow = (s.stockBags || 0) <= LOW_STOCK_THRESHOLD;
            return (
              <div key={s.id} className={`bg-card rounded-xl border p-4 ${isLow ? 'border-destructive/40' : 'border-border'}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold">{s.brand} — {s.feedType}</h4>
                    <p className="text-sm text-muted-foreground">R{s.pricePerBag.toLocaleString()}/bag</p>
                  </div>
                  {isLow && (
                    <Badge variant="destructive" className="flex items-center gap-1 text-xs">
                      <AlertTriangle className="h-3 w-3" />Low
                    </Badge>
                  )}
                </div>
                <div className="text-2xl font-bold text-foreground">
                  {(s.stockBags || 0)} <span className="text-sm font-normal text-muted-foreground">bags</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {feedSettings.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Settings className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No feed settings yet. Add feed brands to get started.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.filter(g => g.settings.length > 0).map(g => (
            <div key={g.type}>
              <h3 className="font-semibold text-lg mb-3">{g.type} Feed</h3>
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead>Price/Bag</TableHead>
                      <TableHead>Bags/100 Chickens</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.settings.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.brand}</TableCell>
                        <TableCell>R{s.pricePerBag.toLocaleString()}</TableCell>
                        <TableCell>{s.bagsPerHundredChickens}</TableCell>
                        <TableCell>
                          <span className={(s.stockBags || 0) <= LOW_STOCK_THRESHOLD ? 'text-destructive font-semibold' : ''}>
                            {s.stockBags || 0} bags
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <button onClick={() => startEdit(s)} className="text-muted-foreground/50 hover:text-primary transition-colors"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => deleteSetting(s.id)} className="text-muted-foreground/50 hover:text-destructive transition-colors"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
