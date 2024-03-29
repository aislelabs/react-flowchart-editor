import React from 'react';
import PropTypes from 'prop-types';
import './css/AlWindowEditor.css';

let uuidv4 = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
        /[xy]/g,
        function (c) {
            let r = (Math.random() * 16) | 0,
                v = c == 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        }
    );
};
let defaultUuidFcn = uuidv4;

class AlWindowEditor extends React.Component {
    constructor(props) {
        super(props);
        this.canvasRef = React.createRef();
        this.scrollFix = false;
        this.state = {
            contentSelectedNodeId: -1, // contentSelectedNodeId : node id selected for moving
            outputSelectedNodeId: -1,
            outputSelectedIdx: -1,
            resizeSelectedNodeId: -1,
            canvasMoveSelected: -1,
            editorSelectedNodeId: -1,

            // which "drop something here" target box is hovered over?
            // for now, the target box id is 1000 * parent node Id + out node index
            // assumes no node will have over 1000 output nodes
            targetDropBoxId: -1,

            canvasOffsetX: 0,
            canvasOffsetY: 0,
            canvasScale: 1.0,

            currentMouseX: -1,
            currentMouseY: -1,
            mouseDownMillis: -1,
            mouseDownX: -1,
            mouseDownY: -1,
            mouseDownOffsetX: -1,
            mouseDownOffsetY: -1,

            // TODO : handle bad initial Input data. If bad person input nodeDescriptor and nodeLinks that contains
            //        none synchronized nodes, we can do some intelligent removal of node link here.
            // nodeDescriptors: an array of JSON that looks like : {
            //   "nodeId": 1,
            //   "nodeUuid": a uuid v4 generated randomly at node creation time by the browser
            //   "nodeType": "dummy",
            //   "data": {},
            //   "numInputs": 1,
            //   "numOutputs": 1,
            //   "yesNoOutput":  false,
            //   "display": {
            //     "offsetX": 43.5,
            //     "offsetY": 65,
            //     "width": 136.5,
            //     "height": 103
            //   }
            // }
            nodeDescriptors: props.initialNodeDescriptors
                ? [...props.initialNodeDescriptors]
                : [],
            // nodeLinks : an array of (outputNodeId, outputNodeIdx, inputNodeId, inputNodeIdx)
            // the semantics is a directed link from outputNodeId to inputNodeId, of the respective input/out box id
            //  the box ID's start with 0 (see getNodeWrapper)
            nodeLinks: props.initialNodeLinks
                ? [...props.initialNodeLinks]
                : [],

            // states for left component area:
            componentAreaOpen: props.componentAreaOpen || false,
            // states for right editor component area:
            editorAreaOpen: false,
            // the search box at the top of the component area:
            componentSearchText: '',
        };
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        if (!this.scrollFix) {
            if (this.canvasRef && this.canvasRef.current) {
                this.scrollFix = true;
                this.canvasRef.current.addEventListener(
                    'wheel',
                    e => {
                        e.preventDefault();
                    },
                    {passive: false}
                );
            }
        }

        if (
            this.props.initialNodeDescriptors &&
            this.props.initialNodeDescriptors.length > 0 &&
            (!prevProps.initialNodeDescriptors ||
                prevProps.initialNodeDescriptors.length == 0) &&
            this.state.nodeDescriptors.length == 0
        ) {
            /* catch React lifecycle. React will sometimes mount component without props, then supply
               the props. We have to detect that in order to ingest the initial node descriptors and node links.
               We are only detecting the case where the previous prop doesn't have initial descriptors but the
               current prop does. We assume that the component has finally supplied the initial node descriptors
               in this case.
             */
            this.setState({
                nodeDescriptors: [...this.props.initialNodeDescriptors],
            });
        }
        if (
            this.props.initialNodeLinks &&
            this.props.initialNodeLinks.length > 0 &&
            (!prevProps.initialNodeLinks ||
                prevProps.initialNodeLinks.length == 0) &&
            this.state.nodeLinks.length == 0
        ) {
            this.setState({nodeLinks: [...this.props.initialNodeLinks]});
        }

        if (this.props.viewOnly) {
            return;
        }
        if (typeof this.props.updateCbkFcn == 'function') {
            let nodeDesc = this.state.nodeDescriptors;
            let nodeLinks = this.state.nodeLinks;
            if (
                this.state.canvasMoveSelected == -1 &&
                this.state.contentSelectedNodeId == -1 &&
                this.state.contentSelectedNodeId == -1 &&
                this.state.outputSelectedNodeId == -1 &&
                !(
                    this.state.editorAreaOpen === true &&
                    this.state.editorSelectedNodeId > -1 &&
                    !prevState.editorAreaOpen
                ) /*just opening the editor window by double clicking on a node*/ &&
                this.state.componentAreaOpen == prevState.componentAreaOpen &&
                this.state.componentSearchText == prevState.componentSearchText
            ) {
                try {
                    this.props.updateCbkFcn(nodeDesc, nodeLinks);
                } catch (cbkE) {
                    console.error(cbkE);
                }
            }
        }
    }
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////
    getComponentDescriptor = componentTypeName => {
        let componentRegistry = this.props.componentRegistry;
        if (
            typeof componentRegistry == 'undefined' ||
            !componentRegistry ||
            componentRegistry.length == 0
        ) {
            return null;
        }
        let componentDescriptor = componentRegistry.filter(elm => {
            return elm.componentTypeName == componentTypeName;
        });
        if (!componentDescriptor || componentDescriptor.length == 0) {
            return null;
        }
        return componentDescriptor[0];
    };

    getDataUpdaterFcnForNodeId = nodeId => {
        let captureNodeId = nodeId;
        let me = this;
        return newData => {
            me.setNewDataForNodeIdToState(captureNodeId, newData);
        };
    };

    // returns a method of 2 parameter that allows the component edit window
    // to change the component type
    getChangeNodeTypeFcn = nodeId => {
        let nodeIdToDescriptor = this.getNodeIdToNodeDescriptor();
        let nodeInfo = nodeIdToDescriptor[nodeId];
        if (!nodeInfo) {
            return () => {};
        }
        let componentRegistry = this.props.componentRegistry;
        return (newNodeType /*string*/, newData /*optional map {}*/) => {
            if (newNodeType == nodeInfo.nodeType) {
                return;
            }
            let compDesc = this.getComponentDescriptor(newNodeType);
            if (!compDesc) {
                throw (
                    'componentTypeName ' +
                    newNodeType +
                    ' is invalid (component not registered or typo)'
                );
                /*compDesc = {
                    defaultDataFcn: () => {},
                    numInputs: 1,
                    numOutputs: 1,
                    yesNoOutput: false,
                };*/
            }
            let numInputs = compDesc.numInputs;
            let numOutputs = compDesc.numOutputs;
            let newNodeDescriptor = [...this.state.nodeDescriptors] || [];
            let i = 0;
            // change the node type
            for (i = 0; i < newNodeDescriptor.length; ++i) {
                if (newNodeDescriptor[i].nodeId == nodeId) {
                    newNodeDescriptor[i].nodeType = newNodeType;
                    newNodeDescriptor[i].data =
                        newData || compDesc.defaultDataFcn();
                    newNodeDescriptor[i].numInputs = numInputs;
                    newNodeDescriptor[i].numOutputs = numOutputs;
                    newNodeDescriptor[i].yesNoOutput = compDesc.yesNoOutput;
                    break;
                }
            }
            // remove links that are nolonger valid : too many relative to the new
            //  number of in/outputs
            let tempNodeLinks = [...this.state.nodeLinks] || [];
            let newNodeLinks = [];
            for (i = 0; i < tempNodeLinks.length; ++i) {
                let [
                    outNodeId,
                    outNodeIdx,
                    inNodeId,
                    inNodeIdx,
                ] = tempNodeLinks[i];
                let toDelete = false;
                if (outNodeId == nodeId && outNodeIdx > numOutputs - 1) {
                    toDelete = true;
                }
                if (inNodeId == nodeId && inNodeIdx > numInputs - 1) {
                    toDelete = true;
                }
                if (!toDelete) {
                    newNodeLinks.push([
                        outNodeId,
                        outNodeIdx,
                        inNodeId,
                        inNodeIdx,
                    ]);
                }
            }
            this.setState({
                nodeDescriptors: newNodeDescriptor,
                nodeLinks: newNodeLinks,
            });
        }; // END OF return (...)
    };

    getNodeIdToNodeDescriptor = () => {
        let nodeDescriptors = this.state.nodeDescriptors;
        if (nodeDescriptors == null || nodeDescriptors.length == 0) {
            return {};
        }
        let nodeIdToDescriptor = {};
        let i = 0;
        for (i = 0; i < nodeDescriptors.length; ++i) {
            let descriptor = nodeDescriptors[i];
            nodeIdToDescriptor[descriptor.nodeId] = descriptor;
        }
        return nodeIdToDescriptor;
    };

    getPointerDiscretization = () => {
        let p = 1;
        if (this.props.pointerDiscretization) {
            try {
                p = Math.max(p, parseInt(this.props.pointerDiscretization));
            } catch (err) {}
        }
        return p;
    };

    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////
    canvasmousedown = e => {
        let dom = e.target;

        let canvas = dom.closest('.topCanvas');
        if (dom.classList.contains('alweResizeBox')) {
            if (this.props.viewOnly) {
                return;
            }
            let closestNodeWrapper = dom.closest('.alweNodeWrapper');
            if (closestNodeWrapper != null) {
                this.setState({
                    contentSelectedNodeId: -1,
                    outputSelectedNodeId: -1,
                    outputSelectedIdx: -1,
                    canvasMoveSelected: -1,
                    resizeSelectedNodeId: parseInt(
                        closestNodeWrapper.dataset.nodeId
                    ),
                    mouseDownX: (e.clientX - canvas.getBoundingClientRect().left) / this.state.canvasScale,
                    mouseDownY: (e.clientY - canvas.getBoundingClientRect().top) / this.state.canvasScale,
                });
            }
        } else if (
            dom.classList.contains('nodecontent') ||
            dom.parentNode.classList.contains('nodecontent')
        ) {
            if (this.props.viewOnly) {
                return;
            }
            let closestNodeWrapper = dom.closest('.alweNodeWrapper');
            if (closestNodeWrapper != null) {
                let epoch = new Date().getTime();
                let mouseDownContentNodeId = closestNodeWrapper.dataset.nodeId;
                let offsetX =
                    e.clientX - closestNodeWrapper.getBoundingClientRect().left;
                let offsetY =
                    e.clientY - closestNodeWrapper.getBoundingClientRect().top;
                this.setState({
                    outputSelectedNodeId: -1,
                    outputSelectedIdx: -1,
                    resizeSelectedNodeId: -1,
                    canvasMoveSelected: -1,
                    contentSelectedNodeId: parseInt(mouseDownContentNodeId),
                    mouseDownOffsetX: offsetX,
                    mouseDownOffsetY: offsetY,

                    mouseDownMillis: epoch,
                });
            }
        } else if (dom.classList.contains('alweOutput')) {
            if (this.props.viewOnly) {
                return;
            }
            let closestNodeWrapper = dom.closest('.alweNodeWrapper');
            let outputIdx = dom.dataset.idx;
            if (outputIdx != null) {
                if (
                    typeof outputIdx == 'string' &&
                    outputIdx.startsWith('output_')
                ) {
                    outputIdx = outputIdx.substr(7);
                }
                this.setState({
                    contentSelectedNodeId: -1,
                    resizeSelectedNodeId: -1,
                    canvasMoveSelected: -1,
                    mouseDownX:
                        (e.clientX - canvas.getBoundingClientRect().left) / this.state.canvasScale,
                    mouseDownY:
                        (e.clientY - canvas.getBoundingClientRect().top) / this.state.canvasScale,
                    outputSelectedNodeId: parseInt(
                        closestNodeWrapper.dataset.nodeId
                    ),
                    outputSelectedIdx: parseInt(outputIdx),
                });
            }
        } else if (dom.classList.contains('topCanvas')) {
            this.setState({
                contentSelectedNodeId: -1,
                resizeSelectedNodeId: -1,
                outputSelectedNodeId: -1,
                canvasMoveSelected: 1,
                mouseDownX:
                    (e.clientX - dom.getBoundingClientRect().left) /
                    this.state.canvasScale,
                mouseDownY:
                    (e.clientY - dom.getBoundingClientRect().top) /
                    this.state.canvasScale,
            });
        }
    };

    canvaswheel = e => {
        let dom = e.target;
        let canvas = dom.closest('.topCanvas');
        if (canvas == dom) {
            // scrolling on the canvas working area.
            let multiple = 0;
            if (e.deltaY < 0) {
                multiple = 1;
            } else if (e.deltaY > 0) {
                multiple = -1;
            }
            let oldScaling = this.state.canvasScale;
            let scaling = oldScaling + 0.1 * multiple;
            if (scaling >= 1.6) {
                scaling = 1.6;
            }
            if (scaling < 0.7) {
                scaling = 0.7;
            }
            if (oldScaling != scaling) {
                let scalechange = scaling - oldScaling;
                let x = (this.state.canvasOffsetX * scaling) / oldScaling;
                let y = (this.state.canvasOffsetY * scaling) / oldScaling;
                this.setState({
                    canvasOffsetX: x,
                    canvasOffsetY: y,
                    canvasScale: scaling,
                });
            }
        }
    };

    canvasmousemove = e => {
        let dom = e.target;
        let canvas = dom.closest('.topCanvas');
        if (
            this.state.contentSelectedNodeId != null &&
            this.state.contentSelectedNodeId > -1
        ) {
            let newWrapperX =
                e.clientX -
                this.state.mouseDownOffsetX -
                canvas.getBoundingClientRect().left;
            newWrapperX /= this.state.canvasScale;
            let newWrapperY =
                //e.clientY - this.state.mouseDownOffsetY - canvas.getBoundingClientRect().top;
                e.clientY - canvas.getBoundingClientRect().top;
            newWrapperY /= this.state.canvasScale;
            // XXX this is to prevent draggable to overlap with window element moving
            // see around line 1046 onDrag()

            newWrapperX =
                parseInt(newWrapperX / this.getPointerDiscretization()) *
                this.getPointerDiscretization();
            newWrapperY =
                parseInt(newWrapperY / this.getPointerDiscretization()) *
                this.getPointerDiscretization();

            newWrapperY += Math.max(3, this.getPointerDiscretization());

            this.setState(state => {
                let nodeDescriptors = [...state.nodeDescriptors];
                let nodeDescriptor = nodeDescriptors.filter(
                    elm =>
                        parseInt(elm.nodeId) ==
                        parseInt(this.state.contentSelectedNodeId)
                );
                if (nodeDescriptor != null && nodeDescriptor.length > 0) {
                    nodeDescriptor = nodeDescriptor[0];
                    nodeDescriptor.display.offsetX = newWrapperX;
                    nodeDescriptor.display.offsetY = newWrapperY;
                    return {
                        ...state,
                        nodeDescriptors: nodeDescriptors,
                    };
                }
            });
        } else if (
            this.state.outputSelectedNodeId != null &&
            this.state.outputSelectedNodeId > -1
        ) {
            this.setState({
                currentMouseX:
                    (e.clientX - canvas.getBoundingClientRect().left) /
                    this.state.canvasScale,
                currentMouseY:
                    (e.clientY - canvas.getBoundingClientRect().top) /
                    this.state.canvasScale,
            });
        } else if (
            this.state.resizeSelectedNodeId != null &&
            this.state.resizeSelectedNodeId > -1
        ) {
            let currentX = e.clientX - canvas.getBoundingClientRect().left;
            currentX /= this.state.canvasScale;
            let currentY = e.clientY - canvas.getBoundingClientRect().top;
            currentY /= this.state.canvasScale;
            let nodeId = this.state.resizeSelectedNodeId;

            let descriptors = this.state.nodeDescriptors;
            let i = 0;
            let newDescriptorList = [];
            for (i = 0; descriptors != null && i < descriptors.length; ++i) {
                let descriptor = descriptors[i];
                if (descriptor.nodeId == nodeId) {
                    let newWidth =
                        parseInt(
                            (currentX - descriptor.display.offsetX) /
                            this.getPointerDiscretization()
                        ) * this.getPointerDiscretization();
                    let newHeight =
                        parseInt(
                            (currentY - descriptor.display.offsetY) /
                            this.getPointerDiscretization()
                        ) * this.getPointerDiscretization();
                    descriptor.display.width = Math.max(32, newWidth);
                    descriptor.display.height = Math.max(32, newHeight);
                    newDescriptorList.push(descriptor);
                } else {
                    newDescriptorList.push(descriptor);
                }
            }
            this.setState({nodeDescriptors: newDescriptorList});
        } else if (this.state.canvasMoveSelected == 1) {
            let currentX = e.clientX - canvas.getBoundingClientRect().left;
            currentX /= this.state.canvasScale;
            let currentY = e.clientY - canvas.getBoundingClientRect().top;
            currentY /= this.state.canvasScale;
            let newOffX =
                this.state.canvasOffsetX + currentX - this.state.mouseDownX;
            let newOffY =
                this.state.canvasOffsetY + currentY - this.state.mouseDownY;
            this.setState({
                canvasOffsetX: newOffX,
                canvasOffsetY: newOffY,
            });
        }
    };

    canvasmouseup = e => {
        let dom = e.target;
        if (
            this.state.outputSelectedNodeId &&
            this.state.outputSelectedNodeId > -1
        ) {
            if (dom.classList.contains('alweInput')) {
                let closestNodeWrapper = dom.closest('.alweNodeWrapper');
                let inputNodeId = closestNodeWrapper.dataset.nodeId;
                if (inputNodeId != null) {
                    let inputNodeIdx = dom.dataset.idx;
                    if (inputNodeIdx != null) {
                        if (
                            typeof inputNodeIdx == 'string' &&
                            inputNodeIdx.startsWith('input_')
                        ) {
                            inputNodeIdx = inputNodeIdx.substr(6);
                        }
                        let outputNodeId = this.state.outputSelectedNodeId;
                        let outputNodeIdx = this.state.outputSelectedIdx;
                        this.addOutputInputLinkNodeToState(
                            outputNodeId,
                            outputNodeIdx,
                            inputNodeId,
                            inputNodeIdx
                        );
                    }
                }
            }
        }

        if (
            this.state.contentSelectedNodeId != null &&
            this.state.contentSelectedNodeId > -1
        ) {
            // this is the case where we started moving an existing window component
            // and then landed on a "drop something here"  notification box
            if (dom.classList.contains('targetbox')) {
                let dataNodeId = parseInt(dom.dataset.forNodeId);
                let outPortIdx = parseInt(dom.dataset.outIdx);
                let selNodeId = this.state.contentSelectedNodeId;
                let nd = this.getNodeIdToNodeDescriptor()[selNodeId];
                if (
                    !isNaN(dataNodeId) &&
                    !isNaN(outPortIdx) &&
                    nd &&
                    nd.numInputs > 0
                ) {
                    let newLink = [dataNodeId, outPortIdx, selNodeId, 0];
                    this.setState({
                        nodeLinks: [...this.state.nodeLinks, newLink],
                    });
                }
            }
        }

        this.resetSelectedMouseEventStates();
    };

    resetSelectedMouseEventStates = () => {
        this.setState({
            canvasMoveSelected: -1,
            resizeSelectedNodeId: -1,
            contentSelectedNodeId: -1,
            outputSelectedNodeId: -1,
            outputSelectedIdx: -1,
            currentMouseX: -1,
            currentMouseY: -1,
            mouseDownX: -1,
            mouseDownY: -1,
        });
    }

    canvasClick = e => {
        let dom = e.target;
        let closestNodeWrapper = dom.closest('.alweNodeWrapper');
        if (closestNodeWrapper != null) {
            if (this.props.viewOnly) {
                return;
            }
            let epochNow = new Date().getTime();
            let doubleClickedNodeId = closestNodeWrapper.dataset.nodeId;

            if (
                doubleClickedNodeId != null &&
                doubleClickedNodeId > -1 &&
                epochNow - this.state.mouseDownMillis < 130
            ) {
                this.setState({
                    editorAreaOpen: true,
                    editorSelectedNodeId: doubleClickedNodeId,
                });
            }
        }
    };

    canvasdrop = e => {
        if (this.props.viewOnly) {
            return;
        }
        let dom = e.target;
        let isDropOnCanvas = dom.classList.contains('topCanvas');
        let isTargetBoxDropped = dom.classList.contains('targetbox');
        if (isDropOnCanvas || isTargetBoxDropped) {
            // droppOnWindowNodeId : used for when the node
            //     was dropped on 'Drop something here'
            let droppOnWindowNodeId = null;
            let droppedOnWindowNodeOutputIdx = null;

            if (isTargetBoxDropped) {
                droppOnWindowNodeId = dom.dataset.forNodeId;
                droppOnWindowNodeId = parseInt(droppOnWindowNodeId, 10);
                droppedOnWindowNodeOutputIdx = dom.dataset.outIdx;
                droppedOnWindowNodeOutputIdx = parseInt(
                    droppedOnWindowNodeOutputIdx,
                    10
                );
                dom = dom.closest('.topCanvas');
            }
            let ptrX = e.clientX - dom.getBoundingClientRect().left;
            ptrX /= this.state.canvasScale;
            let ptrY = e.clientY - dom.getBoundingClientRect().top;
            ptrY /= this.state.canvasScale;

            e.preventDefault();

            let componentType = e.dataTransfer.getData('componentType');
            if (componentType != null && componentType.length > 0) {
                let componentDescriptor = this.getComponentDescriptor(
                    componentType
                );
                if (componentDescriptor != null) {
                    let maxNodeId = 0;
                    if (
                        this.state.nodeDescriptors != null &&
                        this.state.nodeDescriptors.length > 0
                    ) {
                        let nodeIdList = this.state.nodeDescriptors.map(elm => {
                            return elm.nodeId;
                        });
                        maxNodeId = Math.max(...nodeIdList);
                    }
                    let nodeUuid = null;
                    let calledSuppliedUuidFcn = false;
                    if (
                        typeof this.props.uuidGenFcn == 'undefined' ||
                        !this.props.uuidGenFcn
                    ) {
                        nodeUuid = defaultUuidFcn();
                    } else {
                        nodeUuid = this.props.uuidGenFcn();
                        calledSuppliedUuidFcn = true;
                    }
                    let newNodeId = maxNodeId + 1;
                    let addNodeDescriptorFcn = uuidVal => {
                        let newNodeDescriptor = {
                            nodeId: newNodeId,
                            nodeUuid: uuidVal,
                            nodeType: componentType,
                            data: componentDescriptor.defaultDataFcn(),
                            numInputs: componentDescriptor.numInputs,
                            numOutputs: componentDescriptor.numOutputs,
                            yesNoOutput:
                                componentDescriptor.yesNoOutput || false,
                            display: {
                                offsetX: parseInt(
                                    ptrX -
                                    componentDescriptor.initialWidthPx * 0.5
                                ),
                                offsetY: ptrY,
                                width: componentDescriptor.initialWidthPx,
                                height: componentDescriptor.initialHeightPx,
                            },
                        };
                        if (
                            droppOnWindowNodeId == null ||
                            droppedOnWindowNodeOutputIdx == null ||
                            componentDescriptor.numInputs == 0
                        ) {
                            // dropped onto the canvas
                            this.setState({
                                targetDropBoxId: -1,
                                nodeDescriptors: [
                                    ...this.state.nodeDescriptors,
                                    newNodeDescriptor,
                                ],
                            });
                        } else {
                            // dropped onto the notification "drop something here" box
                            this.setState({
                                targetDropBoxId: -1,
                                nodeDescriptors: [
                                    ...this.state.nodeDescriptors,
                                    newNodeDescriptor,
                                ],
                                nodeLinks: [
                                    ...this.state.nodeLinks,
                                    [
                                        droppOnWindowNodeId,
                                        droppedOnWindowNodeOutputIdx,
                                        newNodeId,
                                        0,
                                    ],
                                ],
                            });
                        }
                    };

                    if (calledSuppliedUuidFcn) {
                        if (nodeUuid != null) {
                            if (typeof nodeUuid == 'string') {
                                addNodeDescriptorFcn(nodeUuid);
                            } else {
                                // if it is not a string, assume the nodeUuid is a promise
                                nodeUuid.then(uuidVal => {
                                    addNodeDescriptorFcn(uuidVal);
                                });
                            }
                        }
                    } else {
                        addNodeDescriptorFcn(nodeUuid);
                    }
                }
            }
        }
    };

    componentContentItemDragStart = e => {
        if (this.props.viewOnly) {
            return;
        }
        let dom = e.target;
        if (dom.classList.contains('componentContentItem')) {
            let componentType = dom.dataset.componentType;
            if (
                componentType != null &&
                typeof componentType == 'string' &&
                componentType.length > 0
            ) {
                e.dataTransfer.setData('componentType', componentType);
            }
        }
    };

    /////////////////////////////////////////////////////////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////////////////////////////

    addOutputInputLinkNodeToState = (
        outputNodeId,
        outputNodeIdx,
        inputNodeId,
        inputNodeIdx
    ) => {
        outputNodeId = parseInt(outputNodeId);
        outputNodeIdx = parseInt(outputNodeIdx);
        inputNodeId = parseInt(inputNodeId);
        inputNodeIdx = parseInt(inputNodeIdx);
        let nodeLinkData = [];
        if (this.state.nodeLinks != null) {
            nodeLinkData = [...this.state.nodeLinks];
        }
        let newTuple = [outputNodeId, outputNodeIdx, inputNodeId, inputNodeIdx];
        let exist = nodeLinkData.filter(elm => {
            return (
                elm[0] == newTuple[0] &&
                elm[1] == newTuple[1] &&
                elm[2] == newTuple[2] &&
                elm[3] == newTuple[3]
            );
        });
        if (exist == null || exist.length == 0) {
            nodeLinkData.push(newTuple);
            this.setState({nodeLinks: nodeLinkData});
        }
    };

    removeOutputInputLinkToState = linkage => {
        if (linkage != null && linkage.length >= 4) {
            let links = [];
            let i = 0;
            for (
                i = 0;
                this.state.nodeLinks != null && i < this.state.nodeLinks.length;
                ++i
            ) {
                let thislink = this.state.nodeLinks[i];
                if (
                    !(
                        thislink[0] == linkage[0] &&
                        thislink[1] == linkage[1] &&
                        thislink[2] == linkage[2] &&
                        thislink[3] == linkage[3]
                    )
                ) {
                    links.push([...thislink]);
                }
            }
            this.setState(state => {
                return {
                    ...state,
                    nodeLinks: links,
                };
            });
        }
    };

    deleteEditorSelectedNodeToState = () => {
        let editorSelectedNodeId = this.state.editorSelectedNodeId;
        if (
            typeof editorSelectedNodeId == 'undefined' ||
            editorSelectedNodeId == -1
        ) {
            return;
        }
        editorSelectedNodeId = parseInt(editorSelectedNodeId);
        let nodeDescriptors = this.state.nodeDescriptors;
        if (!nodeDescriptors || nodeDescriptors.length == 0) {
            return;
        }
        nodeDescriptors = [...nodeDescriptors];
        let nodeLinks = [...this.state.nodeLinks];
        nodeDescriptors = nodeDescriptors.filter(elm => {
            return parseInt(elm.nodeId) != editorSelectedNodeId;
        });
        nodeLinks = nodeLinks.filter(elm => {
            return (
                parseInt(elm[0]) != editorSelectedNodeId &&
                parseInt(elm[2]) != editorSelectedNodeId
            );
        });
        this.setState({
            nodeDescriptors: nodeDescriptors,
            nodeLinks: nodeLinks,
            editorSelectedNodeId: -1,
            editorAreaOpen: false,
        });
    };

    setNewDataForNodeIdToState = (nodeId, newNodeData) => {
        let nodeDescriptors = this.state.nodeDescriptors;
        if (!nodeDescriptors || nodeDescriptors.length == 0) {
            return;
        }
        nodeDescriptors = [...nodeDescriptors];
        let i = 0;
        for (i = 0; i < nodeDescriptors.length; ++i) {
            let descriptor = nodeDescriptors[i];
            if (descriptor.nodeId == nodeId) {
                descriptor.data = {...newNodeData};
                this.setState({
                    nodeDescriptors: nodeDescriptors,
                });
                return;
            }
        }
    };

    onComponentSearchTextChange = e => {
        if (e.target.value != null) {
            this.setState({componentSearchText: e.target.value});
        }
    };

    getSuggestionTargetBoxJsx = (
        targetBoxWidthPixel,
        targetBoxMarginPixel /* left right margin */,
        targetBoxDistanceToParentWindowVertical,
        selectedTargetDropBoxId /* == this.state.targetDropBoxId */,
        parentOffsetX,
        parentOffsetY,
        parentWidth,
        parentHeight,
        parentNumOutputs,
        parentNodeId,
        parentOutIdx
    ) => {
        if (parentNumOutputs < 1) {
            return null;
        }
        let eachWW = targetBoxWidthPixel + 2 * targetBoxMarginPixel;
        let totalWidth = eachWW * parentNumOutputs;
        let beginLeftOffset = (parentWidth - totalWidth) * 0.5;
        let myXOffset = beginLeftOffset + parentOutIdx * eachWW;
        myXOffset += parentOffsetX;
        let myYOffset = parentHeight + targetBoxDistanceToParentWindowVertical;
        myYOffset += parentOffsetY;
        let myTargetBoxId = parentNodeId * 1000 + parentOutIdx;
        let additionalClassName =
            myTargetBoxId == selectedTargetDropBoxId ? 'dragover' : '';

        // XXX outputNodePixelSize
        let outputNodePixelSize = 27 + 8 * 2;
        let [svgX0, svgY0] = this.getXYCoordinatesForInputOutputNode(
            false,
            parentWidth,
            parentHeight,
            parentOutIdx,
            parentNumOutputs,
            outputNodePixelSize
        );
        svgX0 += parentOffsetX;
        svgY0 += parentOffsetY;
        let [svgX1, svgY1] = this.getXYCoordinatesForInputOutputNode(
            true,
            eachWW,
            1,
            0,
            1,
            1
        );
        svgX1 += myXOffset;
        svgY1 += myYOffset;
        return (
            <React.Fragment>
                <div
                    key={`recommend_target_box_${parentNodeId}_${parentOutIdx}`}
                    className={`targetbox ${additionalClassName}`}
                    data-for-node-id={parentNodeId}
                    data-out-idx={parentOutIdx}
                    data-target-box-id={myTargetBoxId}
                    style={{
                        left: myXOffset + 'px',
                        top: myYOffset + 'px',
                        width: targetBoxWidthPixel + 'px',
                        maxWidth: targetBoxWidthPixel + 'px',
                        margin: '0 ' + targetBoxMarginPixel + 'px',
                    }}
                    onDragEnter={dragEv => {
                        this.setState({targetDropBoxId: myTargetBoxId});
                    }}
                    onDragExit={dragEv => {
                        this.setState({targetDropBoxId: -1});
                    }}
                    onDragLeave={dragEv => {
                        this.setState({targetDropBoxId: -1});
                    }}
                    onDragEnd={dragEv => {
                        this.setState({targetDropBoxId: -1});
                    }}
                    onMouseEnter={mouseEv => {
                        this.setState({targetDropBoxId: myTargetBoxId});
                    }}
                    onMouseLeave={mouseEv => {
                        this.setState({targetDropBoxId: -1});
                    }}
                >
                    {this.props.dropNotificationElement}
                </div>
                {this.getSvgPointAB(
                    svgX0,
                    svgY0,
                    svgX1,
                    svgY1,
                    `recommendoutlink_${parentNodeId}_${parentOutIdx}`,
                    null,
                    'silverPath svg_stroke_dash_array'
                )}
            </React.Fragment>
        );
    };

    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////
    getNodeWrapperJsx = nodeDescriptorData => {
        let nodeId = nodeDescriptorData.nodeId;
        //let nodeUuid = nodeDescriptorData.nodeUuid;
        let nodeType = nodeDescriptorData.nodeType;
        let perNodeData = nodeDescriptorData.data;
        let numInputs = nodeDescriptorData.numInputs;
        let numOutputs = nodeDescriptorData.numOutputs;
        let isYesNoOutput = nodeDescriptorData.yesNoOutput;
        let displayObj = nodeDescriptorData.display;
        let displayOffsetX = displayObj.offsetX;
        let displayOffsetY = displayObj.offsetY;
        let displayContentWrapperWidth = displayObj.width;
        let displayContentWrapperHeight = displayObj.height;
        let contentIsSelected = this.state.contentSelectedNodeId == nodeId;
        let outputSelected =
            this.state.outputSelectedIdx != null &&
            this.state.outputSelectedIdx > -1 &&
            this.state.outputSelectedNodeId == nodeId;
        let outputSelectIdx = this.state.outputSelectedIdx;
        let editorSelectedCssClassName = '';
        let adhocNodeidBorderColour = null;
        if (this.state.editorSelectedNodeId == nodeId) {
            // this node is dblclk selected
            editorSelectedCssClassName = 'editorselected';
        } else if (
            this.props.nodeidBorderColorMap != null &&
            nodeId in this.props.nodeidBorderColorMap
        ) {
            // this nodeid has a specific border color requirement from props
            adhocNodeidBorderColour = this.props.nodeidBorderColorMap[nodeId];
        }

        let linksData = this.state.nodeLinks;
        let outputActive = {};
        let inputActive = {};
        let i = 0;
        for (i = 0; linksData != null && i < linksData.length; ++i) {
            let linkage = linksData[i];
            if (linkage[0] == nodeId) {
                outputActive[linkage[1]] = 1;
            }
            if (linkage[2] == nodeId) {
                inputActive[linkage[3]] = 1;
            }
        }

        let inputElements = [];
        for (i = 0; i < numInputs; ++i) {
            let inputElm = null;
            let activeStr = '';
            if (inputActive[i] == 1) {
                activeStr = 'active';
            }

            let downArrowSvgPath = (
                <path
                    className="alweInput"
                    key={'alweInput_' + i}
                    data-idx={'input_' + i}
                    fill="white"
                    d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z"
                />
            );
            let downArrowSvg = (
                <svg style={{width: (this.props.inputNodeSizePx) + 'px',
                    height: (this.props.inputNodeSizePx) + 'px',
                    top: (this.props.inputNodeTopOffset) + 'px'}}
                     className={`alweInput ${activeStr}`}
                     key={'alweInput_' + i}
                     data-idx={'input_' + i}
                     viewBox="0 0 24 24"
                     xmlns="http://www.w3.org/2000/svg"
                >
                    {downArrowSvgPath}
                </svg>
            );
            inputElements.push(downArrowSvg);
        }
        let outputElements = [];
        for (i = 0; i < numOutputs; ++i) {
            let activeStr = '';
            if (
                (outputSelected && i == outputSelectIdx) ||
                outputActive[i] == 1
            ) {
                activeStr = 'active';
            }
            if (numOutputs == 2 && isYesNoOutput === true) {
                let additionalClass = i == 0 ? 'yes' : 'no';
                let yesPath = (
                    <path
                        fill="white"
                        // also add className, key, data-idx to the actual path element. Because on click or on mouse up
                        // if the pointer lands on the path element rather than the svg background, we want the link
                        // to also connect, and not disappear mysteriously
                        className="alweOutput"
                        key={'alweOutput_' + i}
                        data-idx={'output_' + i}
                        d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"
                    />
                );
                let noPath = (
                    <path
                        fill="white"
                        className="alweOutput"
                        key={'alweOutput_' + i}
                        data-idx={'output_' + i}
                        d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"
                    />
                );
                outputElements.push(
                    <svg
                        style={{width: (this.props.outputNodeSizePx) + 'px',
                            height: (this.props.outputNodeSizePx) + 'px',
                            top: (this.props.outputNodeTopOffset) + 'px'}}
                        xmlns="http://www.w3.org/2000/svg"
                        className={`alweOutput ${activeStr} ${additionalClass}`}
                        key={'alweOutput_' + i}
                        data-idx={'output_' + i}
                        viewBox="0 0 24 24"
                    >
                        {i == 0 ? yesPath : noPath}
                    </svg>
                );
            } else {
                let downArrowSvgPath = (
                    <path
                        className="alweOutput"
                        key={'alweOutput_' + i}
                        data-idx={'output_' + i}
                        fill="white"
                        d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z"
                    />
                );
                let downArrowSvg = (
                    <svg
                        style={{width: (this.props.outputNodeSizePx) + 'px',
                            height: (this.props.outputNodeSizePx) + 'px',
                            top: (this.props.outputNodeTopOffset) + 'px'}}
                        className={`alweOutput ${activeStr}`}
                        key={'alweOutput_' + i}
                        data-idx={'output_' + i}
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        {downArrowSvgPath}
                    </svg>
                );

                outputElements.push(downArrowSvg);
            }
        }

        ///////////////////////////////////
        let contentJsx = (
            <div>{`Cannot render component of type ${nodeType} : component is not registered`}</div>
        );
        let componentRegistry = this.getComponentDescriptor(nodeType);
        if (componentRegistry != null) {
            let ComponentWindow = componentRegistry.componentWindow;
            if (ComponentWindow != null) {
                contentJsx = (
                    <ComponentWindow
                        data={{...perNodeData}}
                        updater={this.getDataUpdaterFcnForNodeId(nodeId)}
                        display={{...displayObj}}
                    />
                );
            }
        }

        let bottomToolJsx = null;
        /**if ((!Boolean(this.props.viewOnly)) && parseInt(nodeId) == parseInt(this.state.editorSelectedNodeId)) {
            bottomToolJsx = (
                <div className={"bottomTool"}
                >
                    <svg
                        onClick={ this.deleteEditorSelectedNodeToState }

                        xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512">
                        <path fill="white"
                              d="M32 464a48 48 0 0 0 48 48h288a48 48 0 0 0 48-48V128H32zm272-256a16 16 0 0 1 32 0v224a16 16 0 0 1-32 0zm-96 0a16 16 0 0 1 32 0v224a16 16 0 0 1-32 0zm-96 0a16 16 0 0 1 32 0v224a16 16 0 0 1-32 0zM432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16z">
                        </path></svg>
                </div>
            );
        }**/

            ///////////////////////////////////
            ///////////////////////////////////
            // is this node 's output connections connected to other nodes?
        let outConnectedMap = {};
        let outConnections = (this.state.nodeLinks || [])
            .filter(elm => {
                // [outNodeId, outidx, inNodeId, inIdx]
                return elm[0] == nodeId;
            })
            .map(elm => {
                outConnectedMap[elm[1]] = true;
                return elm[1];
            });
        // outConnections : array of output index that are connected to some other node
        let recommendTargetBoxJsxList = [];
        for (let j = 0; j < numOutputs; ++j) {
            let connected = j in outConnectedMap;
            if (!connected) {
                let recommendTargetBoxJsx = this.getSuggestionTargetBoxJsx(
                    this.props.targetBoxWidthPx || 200,
                    this.props.targetBoxMarginPx || 20,
                    this.props.targetBoxDistanceToParentWindowVertical || 40,
                    this.state.targetDropBoxId,
                    displayOffsetX,
                    displayOffsetY,
                    displayContentWrapperWidth,
                    displayContentWrapperHeight,
                    numOutputs,
                    nodeId,
                    j
                );
                if (recommendTargetBoxJsx != null) {
                    recommendTargetBoxJsxList.push(recommendTargetBoxJsx);
                }
            }
        }

        {
            /* ************************************************************** */
            /* ************************************************************** */
            /* ************************************************************** */
            /* ************************************************************** */
            /* ************************************************************** */
        }

        let cursorMoveCss = contentIsSelected === true ? 'cursormove' : '';
        let styleObj = {
            left: displayOffsetX + 'px',
            top: displayOffsetY + 'px',
        };
        if (adhocNodeidBorderColour != null) {
            styleObj = {
                ...styleObj,
                border: '4px solid ' + adhocNodeidBorderColour,
            };
        }
        return (
            <React.Fragment>
                {/************notification box below the component when there's some missing outgoing links ********/}
                {recommendTargetBoxJsxList}
                {/************END OF notification box below the component when there's some missing outgoing links ********/}

                <div
                    className={`alweNodeWrapper ${editorSelectedCssClassName}`}
                    key={'alweNodeWrapper_' + nodeId}
                    data-node-id={nodeId + ''}
                    style={styleObj}
                >
                    <div className={'alweInputs'}>{inputElements}</div>
                    <div
                        className={`nodecontent ${cursorMoveCss}`}
                        style={{
                            width: displayContentWrapperWidth + 'px',
                            height: displayContentWrapperHeight + 'px',
                            maxWidth: displayContentWrapperWidth + 'px',
                            maxHeight: displayContentWrapperHeight + 'px',
                        }}
                    >
                        {contentJsx}
                        <div className={'alweResizeBox'} />
                    </div>
                    <div className={'alweOutputs'}>
                        {outputElements}
                    </div>
                    { bottomToolJsx }
                </div>
            </React.Fragment>
        );
    };

    // returns [x, y] relative to the window's top left corner (0,0)
    getXYCoordinatesForInputOutputNode = (
        isForInputNode,
        windowWidth,
        windowHeight,
        inoutIdx,
        numInOut,
        nodePixelSizeWidth
    ) => {
        let x =
            (windowWidth - numInOut * nodePixelSizeWidth) * 0.5 +
            nodePixelSizeWidth * (inoutIdx + 1 - 0.5);
        let y = windowHeight;
        if (isForInputNode) {
            y = 0;
        }
        return [x, y];
    };

    /*
    Get all the link's between the window nodes  as list of SVGs
     */
    getOutputInputLinkSVGs = () => {
        let nodeDescriptors = this.state.nodeDescriptors;
        if (nodeDescriptors == null || nodeDescriptors.length == 0) {
            return null;
        }
        let nodeLinks = this.state.nodeLinks;
        if (nodeLinks == null || nodeLinks.length == 0) {
            return null;
        }
        let i = 0;
        let returnSvgs = [];
        let nodeIdToDescriptor = this.getNodeIdToNodeDescriptor();

        for (i = 0; i < nodeLinks.length; ++i) {
            // nodeLinks[i]: 4 tuple (outNodeId, outNodeOutIdx, inNodeid, inNodeInIdx)
            // outNodeId and inNodeId starts with 0
            const [outNodeId, outNodeIdx, inNodeId, inNodeIdx] = nodeLinks[i];
            //console.log('outNodeId, outNodeIdx, inNodeId, inNodeIdx', outNodeId, outNodeIdx, inNodeId, inNodeIdx);
            let outNodeDisplay = nodeIdToDescriptor[outNodeId].display;
            let numOutStubs = nodeIdToDescriptor[outNodeId].numOutputs;
            let inNodeDisplay = nodeIdToDescriptor[inNodeId].display;
            let numInStubs = nodeIdToDescriptor[inNodeId].numInputs;
            // whether or not the output node is a yes/no output output
            let isYesNoOutput =
                nodeIdToDescriptor[outNodeId].yesNoOutput || false;
            ////////////////////////////////
            let x = parseInt(this.props.inputNodeSizePx, 10) || 14;
            let inputNodePixelSize = x + 4 * 2;
            x = parseInt(this.props.outputNodeSizePx, 10) || 27;
            let outputNodePixelSize = x + 8 * 2;
            let [x0, y0] = this.getXYCoordinatesForInputOutputNode(
                false,
                outNodeDisplay.width,
                outNodeDisplay.height,
                outNodeIdx,
                numOutStubs,
                outputNodePixelSize
            );
            x0 += outNodeDisplay.offsetX;
            y0 += outNodeDisplay.offsetY;
            let [x1, y1] = this.getXYCoordinatesForInputOutputNode(
                true,
                inNodeDisplay.width,
                inNodeDisplay.height,
                inNodeIdx,
                numInStubs,
                inputNodePixelSize
            );
            x1 += inNodeDisplay.offsetX;
            y1 += inNodeDisplay.offsetY;
            ////////////////////////////////

            let additionalLinkClassName = '';
            if (isYesNoOutput === true) {
                if (outNodeIdx == 0) {
                    additionalLinkClassName = 'output_yes';
                }
                if (outNodeIdx == 1) {
                    additionalLinkClassName = 'output_no';
                }
            }

            let curveClickDeleteHandler = e => {
                this.removeOutputInputLinkToState([
                    outNodeId,
                    outNodeIdx,
                    inNodeId,
                    inNodeIdx,
                ]);
            };

            let domSvg = this.getSvgPointAB(
                x0,
                y0,
                x1,
                y1,
                `outlink_${outNodeId}_${outNodeIdx}_${inNodeId}_${inNodeIdx}`,
                curveClickDeleteHandler,
                additionalLinkClassName
            );
            returnSvgs.push(domSvg);
        }
        return returnSvgs;
    };

    getSvgPointAB = (
        x0,
        y0,
        x1,
        y1,
        svgReactElementKey /*optional*/,
        curveClickHandler /*optional*/,
        additionalClassNames /*optional string*/
    ) => {
        let curvature = 0.5;
        /*
        let p = Math.abs(x1 - x0) * curvature;
        let hx1 = x0 + p;
        let hx2 = x1 - p;
        let pathd = `M ${x0} ${y0} C ${hx1} ${y0} ${hx2} ${y1} ${x1} ${y1}`;
        */

        let isLeftRight = x0 < x1;
        let isTopDown = y0 < y1;
        let width = Math.abs(x0 - x1);
        let height = Math.abs(y0 - y1);
        let isMoreWideThanTall = width > height;

        let pathd = '';
        if (isMoreWideThanTall) {
            if (x1 < x0) {
                [x0, y0, x1, y1] = [x1, y1, x0, y0];
            }
            let p = width * curvature;
            let hx1 = x0 + p;
            let hx2 = x1 - p;
            pathd = `M ${x0} ${y0} C ${hx1} ${y0} ${hx2} ${y1} ${x1} ${y1}`;
        } else {
            if (y1 < y0) {
                [x0, y0, x1, y1] = [x1, y1, x0, y0];
            }
            let p = height * curvature;
            let hy1 = y0 + p;
            let hy2 = y1 - p;
            pathd = `M ${x0} ${y0} C ${x0} ${hy1} ${x1} ${hy2} ${x1} ${y1}`;
        }

        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                key={svgReactElementKey}
                onClick={curveClickHandler}
            >
                <path
                    xmlns="http://www.w3.org/2000/svg"
                    className={`bluePath ${additionalClassNames}`}
                    d={pathd}
                />
            </svg>
        );
    };

    getMagnifyingGlassSvg = (widthPx, heightPx) => {
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width={widthPx + 'px'}
                height={heightPx + 'px'}
                viewBox="0 0 390.704 390.704"
            >
                <path
                    d="M379.711,326.556L265.343,212.188c30.826-54.189,23.166-124.495-23.001-170.663c-55.367-55.366-145.453-55.366-200.818,0
                    c-55.365,55.366-55.366,145.452,0,200.818c46.167,46.167,116.474,53.827,170.663,23.001l114.367,114.369
                    c14.655,14.655,38.503,14.654,53.157,0C394.367,365.059,394.368,341.212,379.711,326.556z M214.057,214.059
                    c-39.77,39.771-104.479,39.771-144.25,0c-39.77-39.77-39.77-104.48,0-144.25c39.771-39.77,104.48-39.77,144.25,0
                    C253.828,109.579,253.827,174.29,214.057,214.059z"
                />
            </svg>
        );
    };

    render() {
        // 1) draw all the nodes on window:
        let jsxNodes =
            this.state.nodeDescriptors != null &&
            this.state.nodeDescriptors.map(descriptor => {
                return this.getNodeWrapperJsx(descriptor);
            });
        // 2) draw an output activated curve to the current mouse position
        let selectedOutputToCurrentCursorSvg = null;
        if (
            this.state.outputSelectedNodeId != null &&
            this.state.outputSelectedNodeId > -1 &&
            this.state.currentMouseX > -1
        ) {
            selectedOutputToCurrentCursorSvg = this.getSvgPointAB(
                this.state.mouseDownX,
                this.state.mouseDownY,
                this.state.currentMouseX - 1,
                this.state.currentMouseY - 1,
                null,
                null,
                'svg_stroke_dash_array'
            );
        }

        // 3) draw all the links for all existing links between the nodes
        let outputInputLinkageSvgs = this.getOutputInputLinkSVGs();

        // 4) render the component selector if it is expanded
        let componentAreaOpenCssClassname =
            this.state.componentAreaOpen && !this.props.viewOnly
                ? 'open'
                : 'closed';
        let componentAreaJsx = null;
        if (this.state.componentAreaOpen === true && !this.props.viewOnly) {
            let componentRegistry = this.props.componentRegistry;
            let componentFilterJsx = (
                <div key={'componentFilter'} className={`alweComponentFilter`}>
                    <input
                        type={'text'}
                        placeholder={'Search...'}
                        value={this.state.componentSearchText}
                        onChange={this.onComponentSearchTextChange}
                    />
                    {this.getMagnifyingGlassSvg(16, 16)}
                </div>
            );
            let componentJsxList = [componentFilterJsx];
            let i = 0;
            let componentNameConsidered = {};
            let searchInputText = this.state.componentSearchText;
            if (searchInputText != null) {
                searchInputText = searchInputText.trim();
            }
            for (
                i = 0;
                componentRegistry != null && i < componentRegistry.length;
                ++i
            ) {
                let registry = componentRegistry[i];
                if (componentNameConsidered[registry.componentTypeName] == 1) {
                    continue;
                }
                let componentSearchText = this.state.componentSearchText;
                if (
                    componentSearchText == null ||
                    componentSearchText.length == 0 ||
                    registry.componentSearchText.indexOf(componentSearchText) >=
                    0 ||
                    registry.componentTypeName.indexOf(componentSearchText) >= 0
                ) {
                    componentNameConsidered[registry.componentTypeName] = 1;
                    let ComponentSelectReactClass = registry.componentSelect;
                    let componentInnerJsx = null;
                    if (
                        typeof ComponentSelectReactClass == 'undefined' ||
                        !ComponentSelectReactClass
                    ) {
                        componentInnerJsx = (
                            <div>{`${registry.componentGroup} - ${registry.componentTypeName}`}</div>
                        );
                    } else {
                        componentInnerJsx = <ComponentSelectReactClass />;
                    }
                    let thisComponentJsx = (
                        <div
                            key={'componentselector_' + i}
                            className={'componentContentItem'}
                            data-component-type={registry.componentTypeName}
                            draggable={'true'}
                            onDragStart={this.componentContentItemDragStart}
                        >
                            {componentInnerJsx}
                        </div>
                    );
                    componentJsxList.push(thisComponentJsx);
                }
            }
            componentAreaJsx = componentJsxList;
        }

        // 5) If a node is selected for edit, render the node's editor:
        let editorAreaOpenCssClassname =
            this.state.editorAreaOpen && !this.props.viewOnly
                ? 'open'
                : 'closed';
        let editorComponentJsx = null;
        let editorSelectedComponentName = '';
        let editorSelectedComponentShouldShowDeleteButton = true;
        if (
            this.state.editorAreaOpen === true &&
            this.state.editorSelectedNodeId > -1 &&
            !this.props.viewOnly
        ) {
            let editorNodeIdNodeDescriptor = this.state.nodeDescriptors.filter(
                elm => {
                    return elm.nodeId == this.state.editorSelectedNodeId;
                }
            );
            if (
                editorNodeIdNodeDescriptor != null &&
                editorNodeIdNodeDescriptor.length == 1
            ) {
                editorSelectedComponentName = editorNodeIdNodeDescriptor[0].nodeType;
                // if the CSS name contains ".", replace all with "_"
                editorSelectedComponentName = editorSelectedComponentName.replaceAll(".", "_");
                let componentRegistry = this.getComponentDescriptor(
                    editorNodeIdNodeDescriptor[0].nodeType
                );
                if (componentRegistry != null) {
                    let EditorComponentReactClass =
                        componentRegistry.componentEdit;
                    if (componentRegistry.showDeleteButtonInEditPane != null) {
                        editorSelectedComponentShouldShowDeleteButton =
                            componentRegistry.showDeleteButtonInEditPane;
                    }
                    editorComponentJsx = (
                        <EditorComponentReactClass
                            data={{...editorNodeIdNodeDescriptor[0].data}}
                            updater={this.getDataUpdaterFcnForNodeId(
                                editorNodeIdNodeDescriptor[0].nodeId
                            )}
                            changeType={this.getChangeNodeTypeFcn(
                                this.state.editorSelectedNodeId
                            )}
                            closeEditor={() => {
                                this.setState(s => {
                                    s.editorAreaOpen = false;
                                    s.editorSelectedNodeId = -1;
                                    return {...s};
                                });
                            }}
                        />
                    );
                }
            }
        }

        let canvasTransform = `translate(${this.state.canvasOffsetX}px, ${this.state.canvasOffsetY}px) scale(${this.state.canvasScale})`;



        {/************************************************************** */}
        {/************************************************************** */}
        {/*********calculate the min width, height for all components on the canvas right now */}

        let minHeight = 0;
        let minWidth = 0;
        let curNodeDescriptors = this.state.nodeDescriptors;
        for (let c = 0; curNodeDescriptors && c < curNodeDescriptors.length; ++c) {
            let display = curNodeDescriptors[c].display;
            let componentYCoord = display.offsetY + display.height;
            minHeight = Math.max(minHeight, componentYCoord);
            let componentXCoord = display.offsetX + display.width;
            minWidth = Math.max(minWidth, componentXCoord);
        }

        let resetOnInvalidMouseMove = (e) => {
            let dom = e.target;
            let cvv = dom.closest('.topCanvas');
            if (!cvv) {
                this.resetSelectedMouseEventStates();
            }
        };
        return (
            <div className={'height100'}
                 onDragEnter={(e) => {
                     e.preventDefault();
                 }}
                 onDragOver={(e) => {
                     e.preventDefault();
                 }}
                 onDrop={(e) => {
                     // component is dropped outside '.topCanvas' to the parent 'height100'
                     // div.  Print an error if the error props is set
                     let dom = e.target;
                     let isDropOnCanvas = dom.classList.contains('topCanvas');
                     let isTargetBoxDropped = dom.classList.contains('targetbox');
                     if (!isDropOnCanvas && !isTargetBoxDropped) {
                         //console.log('invalid drop');
                         if (this.props.invalidNotificationFcn) {
                             try {
                                 this.props.invalidNotificationFcn();
                             } catch (exception) {}
                         }
                     }
                 }}

                 onMouseUp={resetOnInvalidMouseMove}
                 onMouseMove={resetOnInvalidMouseMove}
            >
                {/************************************************************** */}
                {/************************************************************** */}
                {/************************************************************** */}
                {!this.props.viewOnly && (
                    <React.Fragment>
                        <div
                            className={`topInfoBoxArea`}
                        >
                            <div
                                className={'closeOpenButton'}
                                onClick={e => {
                                    this.setState(s => {
                                        s.componentAreaOpen = !s.componentAreaOpen;
                                        return {...s};
                                    });
                                }}
                            >
                                <div
                                    className={`indicator ${componentAreaOpenCssClassname}`}
                                >
                                    {(componentAreaOpenCssClassname == 'open' ? (<p>&minus;</p>) :
                                        (<p>+</p>))}
                                </div>
                            </div>
                            <div className={'topComponentInfoBox'}>
                                Drag and drop to add node
                            </div>
                        </div>

                        <div
                            className={`componentArea ${this.props.componentAreaHideStyle} ${componentAreaOpenCssClassname}`}
                        >
                            <div
                                className={`componentContent ${componentAreaOpenCssClassname}`}
                            >
                                {componentAreaJsx}
                            </div>
                        </div>
                    </React.Fragment>
                )}
                {/************************************************************** */}
                {/************************************************************** */}
                {/************************************************************** */}

                <div className={`editorArea ${editorAreaOpenCssClassname}`}>
                    <div
                        className={`editorContent ${editorAreaOpenCssClassname}`}
                    >
                        {editorComponentJsx}
                    </div>
                    <div
                        className={`editorClose ${editorAreaOpenCssClassname}`}
                    >
                        <div
                            className={'editorCloseButton'}
                            onClick={e => {
                                this.setState(s => {
                                    s.editorAreaOpen = false;
                                    s.editorSelectedNodeId = -1;
                                    return {...s};
                                });
                            }}
                        >
                            Close Editor
                        </div>
                        {editorSelectedComponentShouldShowDeleteButton && (<div
                            className={`editorDeleteButton ${editorSelectedComponentName}`}
                            onClick={this.deleteEditorSelectedNodeToState}
                        >
                            Delete
                        </div>)}
                    </div>
                </div>
                {/************************************************************** */}
                {/************************************************************** */}
                {/************************************************************** */}

                <div
                    ref={this.canvasRef}
                    className={'topCanvas'}
                    style={{
                        transform: canvasTransform,
                        minHeight: (minHeight + 80) + 'px',
                        minWidth: (minWidth + 80) + 'px',
                    }}
                    onMouseDown={this.canvasmousedown}
                    onMouseUp={this.canvasmouseup}
                    onMouseMove={this.canvasmousemove}
                    onWheel={this.canvaswheel}
                    onClick={this.canvasClick}
                    onDrop={this.canvasdrop}
                    onDragOver={e => {
                        e.preventDefault();
                    }}
                >
                    {outputInputLinkageSvgs}
                    {selectedOutputToCurrentCursorSvg}
                    {jsxNodes}
                </div>
            </div>
        );
    }
}


AlWindowEditor.propTypes = {
    // viewOnly : if true, disables all editing functionalities
    viewOnly: PropTypes.bool,

    // componentAreaOpen the default state (boolean) of the component window; Whether or not the component
    // selector window will open by default.
    componentAreaOpen: PropTypes.bool,

    // pointerDiscretization : if specified, must be an integer >= 1. This is used to discretize the coordinates
    //      on the main window (so window resize, window move moves in a square grid of this specific size)
    pointerDiscretization: PropTypes.number,

    // initialNodeDescriptors, initialNodeLinks : these are used as initial
    // values for the FlowChartEditor, same as redux's store hydration.
    initialNodeDescriptors: PropTypes.array,
    initialNodeLinks: PropTypes.array,

    // a function with 0 parameters that gets called when the components
    // are dropped outside a valid target.
    invalidNotificationFcn: PropTypes.func,


    inputNodeSizePx: PropTypes.number,
    outputNodeSizePx: PropTypes.number,
    inputNodeTopOffset: PropTypes.number,
    outputNodeTopOffset: PropTypes.number,

    targetBoxWidthPx: PropTypes.number,
    targetBoxMarginPx: PropTypes.number,
    targetBoxDistanceToParentWindowVertical: PropTypes.number,

    componentAreaHideStyle: PropTypes.string,

    /*
    componentRegistry : array of objects
    {
      componentTypeName : string, name of this component
      componentGroup: string, the group for this componentTypeName component. If you don't need component grouping,
                      set this value to something sensible like 'default'
      componentSearchText: string, the component search box will search against this field
      defaultDataFcn : function with no parameter that returns a copy of the default data for this component
      numInputs: integer, the number of input nodes for this component (can be 0, but not negative)
      numOutputs: integer, the number of output nodes for this component (can be 0, but not negative)
      yesNoOutput: true/false (optional). If numOutputs is 2 and yesNoOutput is set to true, renders check, cross
                   mark as the output stub nodes
      initialWidthPx: integer, the default, initial width in pixels when the component is first added
                               to the main window area
      initialHeightPx: integer, same as initialWidthPx, for height
      showDeleteButtonInEditPane: true | false, whether or not to show the delete button in the editor window
                                  when the component is selected for edit
      componentSelect : React component that represents this component in the component selector
                          (optional, if not specified, will just be the "componentType" string)
      componentWindow : React component that represents this component in the main window area
                        Props : "data" : up to date data for the component
                                "updater": function of 1 parameter (the data) to update data
                                "display": JSON representation of where and how big the window is
                                           on the main area. Here is an example of "display":
                                           "display": {
                                                "offsetX": 43.5,
                                                "offsetY": 65,
                                                "width": 136.5,
                                                "height": 103
                                                }
      componentEdit : React component that is displayed to edit the component attributes
                        Props :
                                "data" : the up to date data for the component
                                "updater": function of 1 parameter (the data) to update data
                                "changeType": a function of 2 parameters : (newComponentTypeName (string), newData (optional map {}))
                                                        that allows the component to be changed to another , registered componentTypeName.
                                                        This method will throw an exception if newComponentTypeName is not a registered component.
                                "closeEditor": a function () =>{} with no argument. That will close the editor window.
    }
    */
    /*
    nodeidBorderColorMap: (an optional) map from nodeid (not node UUID) to color that CSS understands. This will be rendered
                             as the border color of the indicated node ID. This is useful for indicating problems
                             with a set of node ID's
	list of colours: https://www.color-hex.com/
     */
    nodeidBorderColorMap: PropTypes.object,

    componentRegistry: PropTypes.array,

    // updateCbkFcn : callback function for when the data of the nodes on the main window area changes
    //                receives 2 parameters : nodeDescriptors, and nodeLinks.
    updateCbkFcn: PropTypes.func,

    /* optional, a no argument function that is capable of generating application unique
    uuid preferbly in v4. The function can return either the UUID string, or a promise.
     If uuidGenFcn is  not supplied, a default implementation is used*/
    uuidGenFcn: PropTypes.func,

    // "Drop something here" notification text (can be jsx) rendered under each of the unconnected output ports
    dropNotificationElement: PropTypes.oneOfType([PropTypes.object, PropTypes.string])
};


AlWindowEditor.defaultProps = {
    dropNotificationElement: 'Drop something here',
    inputNodeSizePx: 14,
    outputNodeSizePx: 27,
    inputNodeTopOffset: -16,
    outputNodeTopOffset: -13,


    targetBoxWidthPx: 200,
    targetBoxMarginPx: 20,
    targetBoxDistanceToParentWindowVertical: 40,
    componentAreaHideStyle: 'horizontal vertical',

};

export default AlWindowEditor;
