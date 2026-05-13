import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts'

interface SparklineProps {
  data?: number[]
  color?: string
  height?: number
}

export function Sparkline({ data, color = '#3b82f6', height = 28 }: SparklineProps) {
  if (!data || data.length < 2) {
    return <div className="h-7 w-full rounded bg-muted/30" />
  }

  const chartData = data.map((v, i) => ({ i, v }))
  const min = Math.min(...data)
  const max = Math.max(...data)

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <YAxis domain={[min, max]} hide />
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
