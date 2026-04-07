import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

interface BarChartCardProps {
  title: string
  description?: string
  data: Array<Record<string, unknown>>
  dataKey: string
  nameKey: string
  color?: string
  colors?: string[]
  height?: number
  layout?: 'horizontal' | 'vertical'
  formatValue?: (value: number) => string
}

export function BarChartCard({
  title,
  description,
  data,
  dataKey,
  nameKey,
  color = '#3b82f6',
  colors,
  height = 280,
  layout = 'horizontal',
  formatValue = formatCurrency,
}: BarChartCardProps) {
  const isVertical = layout === 'vertical'

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data}
            layout={isVertical ? 'vertical' : 'horizontal'}
            margin={
              isVertical
                ? { top: 5, right: 10, left: 80, bottom: 0 }
                : { top: 5, right: 10, left: 10, bottom: 0 }
            }
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={!isVertical} horizontal={isVertical} />
            {isVertical ? (
              <>
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  className="text-muted-foreground"
                  tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey={nameKey}
                  tick={{ fontSize: 10 }}
                  className="text-muted-foreground"
                  width={75}
                  axisLine={false}
                  tickLine={false}
                />
              </>
            ) : (
              <>
                <XAxis
                  dataKey={nameKey}
                  tick={{ fontSize: 10 }}
                  className="text-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  className="text-muted-foreground"
                  tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                />
              </>
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover) / 0.95)',
                border: '1px solid hsl(var(--border) / 0.6)',
                borderRadius: '10px',
                fontSize: '12px',
                backdropFilter: 'blur(8px)',
              }}
              formatter={(value: any) => [formatValue(Number(value)), title]}
            />
            <Bar dataKey={dataKey} radius={isVertical ? [0, 6, 6, 0] : [6, 6, 0, 0]} barSize={18}>
              {colors
                ? data.map((_, i) => (
                    <Cell key={i} fill={colors[i % colors.length]} />
                  ))
                : data.map((_, i) => <Cell key={i} fill={color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
