import * as React from "react"
import * as THREE from "three"
import { useThree } from "@react-three/fiber"
import { Line2 } from "three/examples/jsm/lines/Line2.js"
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"

export type CapJoinLineProps = {
  points: Array<[number, number, number]>
  color?: string
  lineWidth?: number
  cap?: "butt" | "round" | "square"
  join?: "miter" | "round" | "bevel"
  miterLimit?: number
  depthTest?: boolean
  depthWrite?: boolean
  renderOrder?: number
}

export default function CapJoinLine({
  points,
  color = "black",
  lineWidth = 1,
  cap = "butt",
  join = "miter",
  miterLimit = 2,
  depthTest = false,
  depthWrite = false,
  renderOrder = 0,
}: CapJoinLineProps) {
  const { size } = useThree()
  const geom = React.useMemo(() => new LineGeometry(), [])
  const mat = React.useMemo(() => new LineMaterial({ color: new THREE.Color(color).getHex() }), [])
  const line = React.useMemo(() => new Line2(geom, mat), [geom, mat])

  React.useEffect(() => {
    const flat: number[] = []
    for (const p of points) flat.push(p[0], p[1], p[2])
    geom.setPositions(flat)
    // enable default UVs update if needed
    ;(geom as any).computeBoundingBox?.()
    ;(geom as any).computeBoundingSphere?.()
  }, [geom, points])

  React.useEffect(() => {
    mat.color = new THREE.Color(color)
  }, [mat, color])

  React.useEffect(() => {
    // LineMaterial expects resolution in screen pixels
    mat.resolution.set(size.width, size.height)
  }, [mat, size.width, size.height])

  React.useEffect(() => {
    // linewidth is in screen pixels for LineMaterial
    mat.linewidth = lineWidth
    ;(mat as any).linecap = cap
    ;(mat as any).linejoin = join
    ;(mat as any).miterLimit = miterLimit
    mat.depthTest = depthTest
    mat.depthWrite = depthWrite
    mat.needsUpdate = true
  }, [mat, lineWidth, cap, join, miterLimit, depthTest, depthWrite])

  React.useEffect(() => {
    line.renderOrder = renderOrder
  }, [line, renderOrder])

  React.useEffect(() => () => {
    geom.dispose()
    mat.dispose()
  }, [geom, mat])

  return <primitive object={line} />
}

