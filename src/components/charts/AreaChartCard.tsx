import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

interface AreaChartCardProps {
  title: string
  description?: string
  data: Array<Record<string, unknown>>
  dataKey: string
  xAxisKey: string
  color?: string
  height?: number
  formatValue?: (value: number) => string
}

export function AreaChartCard({
  title,
  description,
  data,
  dataKey,
  xAxisKey,
  color = '#3b82f6',
  height = 280,
  formatValue = formatCurrency,
}: AreaChartCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
            <XAxis
              dataKey={xAxisKey}
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
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              fill={`url(#gradient-${dataKey})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
