import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

interface DonutChartCardProps {
  title: string
  description?: string
  data: Array<{ name: string; value: number; color: string }>
  height?: number
  centerLabel?: string
  centerValue?: string
  formatValue?: (value: number) => string
}

export function DonutChartCard({
  title,
  description,
  data,
  height = 280,
  centerLabel,
  centerValue,
  formatValue = formatCurrency,
}: DonutChartCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="45%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={4}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover) / 0.95)',
                border: '1px solid hsl(var(--border) / 0.6)',
                borderRadius: '10px',
                fontSize: '12px',
                backdropFilter: 'blur(8px)',
              }}
              formatter={(value: any) => [formatValue(Number(value))]}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value: string) => (
                <span className="text-[11px] text-muted-foreground">{value}</span>
              )}
            />
            {centerLabel && centerValue && (
              <text
                x="50%"
                y="42%"
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-foreground"
              >
                <tspan x="50%" dy="-8" fontSize="10" className="fill-muted-foreground">
                  {centerLabel}
                </tspan>
                <tspan x="50%" dy="18" fontSize="14" fontWeight="600">
                  {centerValue}
                </tspan>
              </text>
            )}
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
