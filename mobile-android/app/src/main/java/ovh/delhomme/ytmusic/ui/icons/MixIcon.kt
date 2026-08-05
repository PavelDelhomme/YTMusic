package ovh.delhomme.ytmusic.ui.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * Logo Mix (= Lucide `Radio` : ondes concentriques), distinct du Material `Radio` (poste FM).
 */
val MixIcon: ImageVector
    get() {
        if (_mixIcon != null) return _mixIcon!!
        _mixIcon = ImageVector.Builder(
            name = "MixIcon",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            path(
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            ) {
                moveTo(4.9f, 19.1f)
                curveTo(1f, 15.2f, 1f, 8.8f, 4.9f, 4.9f)
            }
            path(
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            ) {
                moveTo(7.8f, 16.2f)
                curveToRelative(-2.3f, -2.3f, -2.3f, -6.1f, 0f, -8.5f)
            }
            path(
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            ) {
                moveTo(14f, 12f)
                arcToRelative(2f, 2f, 0f, true, true, -4f, 0f)
                arcToRelative(2f, 2f, 0f, true, true, 4f, 0f)
            }
            path(
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            ) {
                moveTo(16.2f, 7.8f)
                curveToRelative(2.3f, 2.3f, 2.3f, 6.1f, 0f, 8.5f)
            }
            path(
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            ) {
                moveTo(19.1f, 4.9f)
                curveTo(23f, 8.8f, 23f, 15.1f, 19.1f, 19f)
            }
        }.build()
        return _mixIcon!!
    }

private var _mixIcon: ImageVector? = null
