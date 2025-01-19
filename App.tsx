import React, { useState, useEffect, useRef } from 'react';
import { View, TouchableHighlight, StatusBar, Text, Pressable, Dimensions, GestureResponderEvent, StyleSheet, Modal, TextInput, NativeTouchEvent } from 'react-native';

import Svg, { Circle, Path } from 'react-native-svg';
import * as NavigationBar from 'expo-navigation-bar';
import ColorPicker, { Panel1, Swatches, colorKit, PreviewText, HueCircular } from 'reanimated-color-picker';
import type { returnedResults } from 'reanimated-color-picker';


import Animated, { useSharedValue, useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated';



import { BlurView } from 'expo-blur';

import Slider from '@react-native-community/slider';

const InfiniteCanvas = () => {

    const [savedPaths, setPaths] = useState<string[]>([]);
    const [curPath, setCurPath] = useState<string>('');

    const [panningOffset, setPanningOffset] = useState<number[]>([0, 0]);
    const [focusOffset, setFocusOffset] = useState<number[]>([0, 0]);

    const [curIdx, setPathIdx] = useState<number>(0);

    const [scale, setScale] = useState<number>(1);

    const [fingerDist, setFingerDist] = useState<number>(1);
    const [prevFocus, setPrevFocus] = useState<number[]>([0, 0]);

    const [prevScale, setPrevScale] = useState<number>(1)
    const [prevFingersPos, setPrevFingersPos] = useState<number[][]>([])
    const [prevFingerDist, setInitialFingerDistance] = useState<number>(0);

    const [width, setWidth] = useState<number>(2)
    const [widthList, setWidthLst] = useState<number[]>([])

    const center = useRef<number[]>([Dimensions.get('window').width / 2, Dimensions.get('window').height / 2]);

    const [onlyPanningMode, setPanningGesture] = useState<boolean>(false);
    const [blockDrawing, setBlockDrawing] = useState<boolean>(false);

    const [showColorPickerModal, setColorPickerModal] = useState(false);
    const [showWidthPicker, setWidthPickerModal] = useState(false);

    const customSwatches = new Array(6).fill('#fff').map(() => colorKit.randomRgbColor().hex());

    const strokeColor = useSharedValue<string>(customSwatches[0]);
    const [colorList, setColorList] = useState<string[]>([])

    const [pointerMode, setPointerMode] = useState<boolean>(false);
    const [leftClick, setLeftClick] = useState<boolean>(false);

    const [pointerPos, setPointerPos] = useState<number[]>(center.current);

    const buttonsContainerColor = '#131313'
    const onColorSelect = (color: returnedResults) => {
        strokeColor.value = color.hex;

    };

    function updatePath(x: number, y: number, scale: number) {

        x = ((x - panningOffset[0] - focusOffset[0] + center.current[0] * (scale - 1)) / scale)
        y = ((y - panningOffset[1] - focusOffset[1] + center.current[1] * (scale - 1)) / scale)


        if (curPath.length == 0) {
            const newPath = `M ${x} ${y} `;
            setCurPath(newPath);
            return;
        }

        const newMove = ` L ${x} ${y} `;

        setCurPath(prevPath => prevPath + newMove);

    }

    const getOffsetToMoveDrawing = (fingerChange: number[][], offset: number[]): number[] => {

        const x_points = fingerChange.reduce((acc: number[], touchPoint: number[]) => [...acc, touchPoint[0]], []);
        const y_points = fingerChange.reduce((acc: number[], touchPoint: number[]) => [...acc, touchPoint[1]], []);

        const dx = offset[0] + x_points.reduce((acc, x) => acc + x)
        const dy = offset[1] + y_points.reduce((acc, y) => acc + y)

        return [dx, dy]

    }

    const getOffsetToFocus = (focus: number[], scaleChange: number): number[] => {

        const dx = focusOffset[0] - (focus[0] - center.current[0]) * scaleChange
        const dy = focusOffset[1] - (focus[1] - center.current[1]) * scaleChange

        return [dx, dy]


    }

    const zoom = () => {

    }

    const draw = (usingPointer: boolean) => {

    }

    const updatePanning = () => {

    }

    const calcFocus = (x_points: number[], y_points: number[]) => {


        const avg_x = x_points.reduce((sum: number, val: number) => sum + val) / x_points.length
        const avg_y = y_points.reduce((sum: number, val: number) => sum + val) / y_points.length

        const focus = [avg_x, avg_y]

        return focus

    }

    const calcDistance = (x_points: number[], y_points: number[]) => {

        return Math.sqrt(Math.pow(x_points[0] - x_points[1], 2) + Math.pow(y_points[0] - y_points[1], 2));
    }

    const prepareForNextDrawing = () => {

        setPathIdx(curIdx + 1);
        setCurPath('')
        setWidthLst(prev => [...prev, width])
        setColorList(prev => [...prev, strokeColor.value])
        setPaths([...savedPaths, curPath]);
        setCurPath('');
        setBlockDrawing(false)


    }

    const onTouchStartSvg = (e: GestureResponderEvent) => {

        const touches = e.nativeEvent.touches

        const fingerPos = touches.map((touchPoint => [touchPoint.pageX, touchPoint.pageY]))
        setPrevFingersPos(fingerPos);

        const moreThanOneFinger = e.nativeEvent.touches.length > 1;

        if (moreThanOneFinger == false) return;

        // if you use two fingers you will be unable to draw until all of them get off the screen
        // this avoids acidental drawing caused by touch fails while zooming

        const hadTwoFingers = e.nativeEvent.touches.length === 2;

        const x_points = touches.reduce((acc: number[], touchPoint: NativeTouchEvent) => [...acc, touchPoint.pageX], []);
        const y_points = touches.reduce((acc: number[], touchPoint: NativeTouchEvent) => [...acc, touchPoint.pageY], []);

        const focus = calcFocus(x_points, y_points)

        setPrevFocus(focus);

        const finger_distance = calcDistance(x_points, y_points)

        setInitialFingerDistance(finger_distance);
        setPrevScale(scale);
        setPrevFingersPos(fingerPos);
        setBlockDrawing(hadTwoFingers)

        if (pointerMode === false) {

            const leftClickMode = !leftClick

            leftClickMode && prepareForNextDrawing()

            setLeftClick(leftClickMode)


        }



        return

    }

    const onTouchMoveSvg = (e: GestureResponderEvent) => {

        const moreThanTwoFingers = e.nativeEvent.touches.length > 2

        if (moreThanTwoFingers) return;

        const oneFinger = e.nativeEvent.touches.length === 1;

        const touches = e.nativeEvent.touches

        // useful data for most cases
        const fingerPos = touches.map((touchPoint => [touchPoint.pageX, touchPoint.pageY]))
        const x_points = touches.reduce((acc: number[], touchPoint: NativeTouchEvent) => [...acc, touchPoint.pageX], []);
        const y_points = touches.reduce((acc: number[], touchPoint: NativeTouchEvent) => [...acc, touchPoint.pageY], []);
        const fingerChange = fingerPos.reduce((acc: number[][], touchPoint: number[], index: number) => {
            return [
                ...acc,
                [
                    touchPoint[0] - prevFingersPos[index][0],
                    touchPoint[1] - prevFingersPos[index][1],
                ],
            ];
        }, []);


        // one finger only
        if (onlyPanningMode) {

            if (oneFinger === false) return;

            const { pageX: x, pageY: y } = e.nativeEvent.touches[0]
            const [prevX, prevY] = prevFingersPos[0]

            const fingerChange: number[][] = [
                [x - prevX, y - prevY],
                [0, 0]
            ]

            const fingerPanning: number[] = getOffsetToMoveDrawing(fingerChange, panningOffset,)

            setPanningOffset(fingerPanning);
            setPrevFingersPos([[x, y]])

            return
        }

        // can be two fingers
        if (pointerMode) {

            const newPointerPos = [pointerPos[0] + fingerChange[0][0], pointerPos[1] + fingerChange[0][1]]

            if (leftClick) {

                updatePath(newPointerPos[0], newPointerPos[1], scale);

            }
            setPointerPos(newPointerPos)
            setPrevFingersPos(fingerPos)

            return
        }



        if (oneFinger) {

            blockDrawing === false && updatePath(x_points[0], y_points[0], scale);

            setPrevFingersPos(fingerPos)

            return

        }

        const finger_distance = calcDistance(x_points, y_points)

        const finger_distance_change = finger_distance - prevFingerDist;


        // 1px causes 0.1 % of scale change

        // Todo: Improve this logic to handle high scale scenarios without agressive zooming
        const newScale = prevScale * (1 + (finger_distance_change / 1000));

        const scaleChange = newScale - prevScale;


        // // const fingerPanning = getOffsetToMoveDrawing(fingerChange, panningOffset)
        // // setPanningOffset(fingerPanning);
        setPrevFingersPos(fingerPos)

        const focus = calcFocus(x_points, y_points);
        const focusOffset = getOffsetToFocus(focus, scaleChange);
        setFocusOffset(focusOffset);

        setFingerDist(finger_distance_change)
        setScale(newScale);
        setPrevFocus(focus);
        setPrevFingersPos(fingerPos);
        setInitialFingerDistance(finger_distance);
        setPrevScale(newScale)

    };

    const onTouchEndSvg = (e: GestureResponderEvent) => {

        const notTouching = e.nativeEvent.touches.length === 0;

        if (notTouching === false) return;


        prepareForNextDrawing()

    }

    const wipeCanvas = () => {

        setPaths([]);
        setCurPath('');
        setPathIdx(0);
        setScale(1)
        setFocusOffset([0, 0])
        setPanningOffset([0, 0])
        setWidthLst([])
        setColorList([])
        setBlockDrawing(false)
    }



    const colorPickerBtnStyle = useAnimatedStyle(() => {
        return {
            backgroundColor: strokeColor.value,
        };
    });


    const WidthPicker = () => {
        if (showWidthPicker) {
            return (
                <View style={{ width: 300, height: 50, position: 'absolute', alignItems: 'center' }}>

                    <Slider
                        style={{
                            width: 300, height: 50,
                        }}

                        minimumValue={1}
                        maximumValue={50}
                        step={1}
                        value={width}

                        onSlidingComplete={w => setWidth(w)}
                        minimumTrackTintColor="#FFFFFF"
                        maximumTrackTintColor="#ffffff"
                        thumbTintColor={strokeColor.value}
                    />
                    <Text style={{
                        color: "#ffffff"
                    }}>
                        {width}
                    </Text>
                </View>
            );
        }
    };

    NavigationBar.setBackgroundColorAsync(buttonsContainerColor);

    return (
        <View style={{ flex: 1, backgroundColor: '#000000ff', alignItems: 'center', justifyContent: 'flex-start', width: '100%', height: '100%' }}>
            <StatusBar backgroundColor={'#000000'} />



            <View onTouchStart={onTouchStartSvg} onTouchMove={onTouchMoveSvg} onTouchEnd={onTouchEndSvg} style={{ width: '100%', flexGrow: 1 }} >

                <Svg
                    style={{ backgroundColor: '#000000ff', width: '100%', flexGrow: 1, 'zIndex': 40 }}
                >
                    {savedPaths.map((path, i) => {

                        return (

                            <Path
                                stroke={colorList[i]}
                                key={i}
                                d={path}
                                fill={'none'}
                                fillOpacity={0}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={widthList[i] / scale}
                                scale={scale}

                                translateX={panningOffset[0] - center.current[0] * (scale - 1) + focusOffset[0]}
                                translateY={panningOffset[1] - center.current[1] * (scale - 1) + focusOffset[1]}

                            />
                        )
                    })}
                    <Path
                        stroke={strokeColor.value}
                        key={curIdx}
                        d={curPath}
                        fill={'none'}
                        strokeWidth={width / scale}
                        fillOpacity={0}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        scale={scale}
                        translateX={panningOffset[0] - center.current[0] * (scale - 1) + focusOffset[0]}
                        translateY={panningOffset[1] - center.current[1] * (scale - 1) + focusOffset[1]}
                    />
                    {/* <Circle
                        stroke={'#1fb1ff'}
                        cx={prevFocus[0]}
                        cy={prevFocus[1]}
                        r={2}

                    /> */}
                </Svg>

            </View>
            <Text style={{
                position: 'absolute',
                left: pointerPos[0] - 8,
                top: pointerPos[1],
                display: pointerMode ? 'flex' : 'none',
                padding: 0,
                margin: 0,
                fontSize: 16,

            }}>
                👆
            </Text>




            {
                // Todo: Make btn more easier to click

                pointerMode &&

                <View onTouchStart={(e) => { setLeftClick(!leftClick) }
                } style={{ borderWidth: 2, paddingHorizontal: 10, marginBottom: leftClick ? 8 : 4, borderRadius: 4, backgroundColor: leftClick ? '#f0bc00' : '#10101000' }} >

                    {leftClick ?

                        <View style={{ paddingVertical: 10, }}></View>

                        :
                        <Text style={{ fontSize: 24, color: '#f0bc00', }}>
                            ▶
                        </Text>
                    }
                </View>
            }


            <View style={{ flexDirection: 'row', gap: 10, width: '100%', paddingHorizontal: 10, paddingVertical: 4, borderColor: '#31313177', backgroundColor: buttonsContainerColor }}>


                <TouchableHighlight onPress={wipeCanvas} style={{ borderWidth: 2, paddingVertical: 0, paddingHorizontal: 16, borderRadius: 4, justifyContent: 'center' }} underlayColor={'#1c1c1c'}>
                    <Text style={{ fontSize: 24, color: '#f0bc00' }}>
                        ✗
                    </Text>
                </TouchableHighlight>

                <TouchableHighlight onPress={() => { setPanningGesture(!onlyPanningMode); setPointerMode(false) }} style={{ borderWidth: 2, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 4, backgroundColor: onlyPanningMode ? '#00000084' : '#1c1c1c00', }} underlayColor={'#1c1c1c'}>
                    <Text style={{ fontSize: 24, color: '#f0bc00', transform: [{ scale: 2 }] }}>
                        ⊹
                    </Text>
                </TouchableHighlight>


                <Animated.View onTouchEnd={() => setColorPickerModal(true)} style={[colorPickerBtnStyle, {
                    flex: 1
                }]}></Animated.View>

                <TouchableHighlight onPress={() => setWidthPickerModal(!showWidthPicker)} style={{ backgroundColor: showWidthPicker ? '#00000084' : '', borderWidth: 2, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 4, }} underlayColor={'#1c1c1c'}>
                    <View style={{
                        position: 'relative',
                        flexDirection: 'column'
                    }}>

                        <Text style={{ fontSize: 24, color: '#ffffff' }}>
                            🤏
                        </Text>
                    </View>
                </TouchableHighlight >
                <TouchableHighlight onPress={() => { setPointerMode(!pointerMode); setPanningGesture(false) }} style={{ borderWidth: 2, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 4, backgroundColor: pointerMode ? '#00000084' : '#1c1c1c00' }}>
                    <Text style={{ fontSize: 24 }}>
                        👆
                    </Text>
                </TouchableHighlight>
            </View>
            <WidthPicker />
            <Modal onRequestClose={() => setColorPickerModal(false)} visible={showColorPickerModal} animationType='fade' transparent={true}>

                <BlurView intensity={20} style={{
                    alignItems: 'center', justifyContent: 'center', width:
                        '100%', height: '100%'
                }}>
                    <Animated.View style={[styles.container]} onTouchEnd={() => setColorPickerModal(false)}>
                        <View style={styles.pickerContainer} onTouchEnd={e => e.stopPropagation()}>
                            <ColorPicker value={strokeColor.value} sliderThickness={20} thumbSize={24} onChange={onColorSelect} boundedThumb>
                                <HueCircular containerStyle={styles.hueContainer} thumbShape='pill'>
                                    <Panel1 style={styles.panelStyle} />
                                </HueCircular>
                                <Swatches style={styles.swatchesContainer} swatchStyle={styles.swatchStyle} colors={customSwatches} />
                                <View style={styles.previewTxtContainer}>
                                    <PreviewText style={{ color: '#707070' }} colorFormat='hsl' />
                                </View>
                            </ColorPicker>
                        </View>

                        <Pressable style={styles.closeButton} onPress={() => setColorPickerModal(false)}>
                            <Text style={{ color: '#707070', fontWeight: 'bold' }}>Close</Text>
                        </Pressable>
                    </Animated.View>
                </BlurView>

            </Modal>

        </View >
    );
};
const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignContent: 'center',
        height: '100%',
        width: '100%',
        backgroundColor: '#42465e97',
    },
    pickerContainer: {
        alignSelf: 'center',
        width: 300,
        backgroundColor: '#303030',
        padding: 20,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 5,
        },
        shadowOpacity: 0.34,
        shadowRadius: 6.27,

        elevation: 10,
    },
    hueContainer: {
        justifyContent: 'center',
    },
    panelStyle: {
        width: '70%',
        height: '70%',
        alignSelf: 'center',
        borderRadius: 16,
    },
    previewTxtContainer: {
        paddingTop: 20,
        marginTop: 20,
        borderTopWidth: 1,
        borderColor: '#bebdbe',
    },
    swatchesContainer: {
        paddingTop: 20,
        marginTop: 20,
        borderTopWidth: 1,
        borderColor: '#bebdbe',
        alignItems: 'center',
        flexWrap: 'nowrap',
        gap: 10,
    },
    swatchStyle: {
        borderRadius: 20,
        height: 30,
        width: 30,
        margin: 0,
        marginBottom: 0,
        marginHorizontal: 0,
        marginVertical: 0,
    },

    closeButton: {
        position: 'absolute',
        bottom: '10%',
        borderRadius: 20,
        paddingHorizontal: 40,
        paddingVertical: 10,
        alignSelf: 'center',
        backgroundColor: '#303030',

        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,

        elevation: 5,
    },
});
export default InfiniteCanvas;

