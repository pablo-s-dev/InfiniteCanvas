import type { CanvasEditorProps } from "./canvasTypes";
import { useCanvasController } from "./hooks/useCanvasController";
import { CanvasScene } from "./components/CanvasScene";
export default function CanvasEditor(props: CanvasEditorProps = {}) {
    const canvas = useCanvasController(props);
    return <CanvasScene {...canvas}/>;
}
