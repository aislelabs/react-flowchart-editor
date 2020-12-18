import React, { Component} from "react";
import PropTypes from 'prop-types';
import AlWindowEditor from '../AlWindowEditor.js';

import "./App.css";



/*****************************************************/
/*****************************************************/
let DummySelect = function (props) {
    return "Component Dummy";
}
class DummyWindow extends React.Component {
    render() {
        return (<div style={{"width": "100%", "margin": "0 auto", "height": "64px"}}>Dummy Object In A Window</div>);
    }
}
class DummyEdit extends React.Component {
    render() {
        return (<div style={{"width": "100%", "margin": "0 auto", "height": "200px"}}>Dummy Editor : nothing to edit</div>);
    }
}


/*****************************************************/
/*****************************************************/
let PictureSelect = function (props) {
    return (<div style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}><img style={{"height": "32px", "display": "inline-block"}} src={"./img/barcodeQR.png"} /><span>Picture Selector</span></div>);
}
class PictureWindow extends React.Component {
    render() {
        let imageLinks = [
            "./img/Add User Group-96.png",
            "./img/Customs Officer-96.png",
            "./img/Shop-150.png",
        ];
        let selected = this.props.data.selected;
        if (!selected) {
            selected = 0;
        }
        selected = parseInt(selected);
        let pictureSrc = imageLinks[selected];
        return (<div style={{"width": "100%", "margin": "0 auto", "minHeight": "64px"}}>
            <img style={{"display": "block", "margin": "0 auto"}} src={pictureSrc} />
            You have selected idx = {selected} : {pictureSrc}
        </div>);
    }
}
class PictureEdit extends React.Component {
    onSelectChange = (event) => {
        let v = event.target.value;
        this.props.updater({"selected": v});
    }
    render() {
        let imageLinks = [
            "./img/Add User Group-96.png",
            "./img/Customs Officer-96.png",
            "./img/Shop-150.png",
        ];

        return (<div style={{"width": "100%", "margin": "0 auto", "height": "64px"}}>
            Select one of the following images to display:
            <select value={this.props.data.selected} onChange={this.onSelectChange}>
                <option value={"0"}>Add User Group-96.png</option>
                <option value={"1"}>Customs Officer-96.png</option>
                <option value={"2"}>Shop-150.png</option>
            </select>
        </div>);
    }
}



/*****************************************************/
/*****************************************************/
let AgeSelect = function (props) {
    return (<div >Age Filter</div>);
}
class AgeWindow extends React.Component {
    state = {}
    render() {
        return (<div style={{"width": "100%", "margin": "0 auto", "height": "100%", "minHeight": "24px",
                             "textAlign": "center", "display": "flex", "justifyContent": "center", "alignItems": "center"}}>
            <div style={{"fontSize": "18px"}}>
            User's &nbsp;<span style={{"borderBottom": "1px dotted #000"}}>age</span>&nbsp;
            is between <span style={{"borderBottom": "1px solid #000"}}>{this.props.data.agerange}</span>
            </div>
        </div>);
    }
}
class AgeEdit extends React.Component {
    onAgeChange = (event) => {
        let v = event.target.value;
        this.props.updater({"agerange": v});
    }
    render() {

        return (<div style={{"width": "100%", "margin": "0 auto", "height": "64px"}}>
            User's age range should be between: <br />
            <select value={this.props.data.agerange} onChange={this.onAgeChange}>
                <option value={"under 18"}>under 18</option>
                <option value={"18 ~ 24"}>18 ~ 24</option>
                <option value={"25 ~ 32"}>25 ~ 32</option>
                <option value={"33 ~ 40"}>33 ~ 40</option>
                <option value={"41 or more"}>41 +</option>
            </select>
        </div>);
    }
}
/*****************************************************/
/*****************************************************/




class App extends Component{

    render() {
        let nodeDescriptors = [];
        let nodeLinks = [];
        let componentRegistry =[
            {
                "componentTypeName": "dummy",
                "componentGroup": "group0",
                "componentSearchText": "dummy",
                "defaultDataFcn": function() {return {};},
                "numInputs": 2,
                "numOutputs": 3,
                "initialWidthPx": 200,
                "initialHeightPx": 100,
                "componentSelect": DummySelect,
                "componentWindow": DummyWindow,
                "componentEdit": DummyEdit,
            },
            {
                "componentTypeName": "pictureselector",
                "componentGroup": "group0",
                "componentSearchText": "picture show image",
                "defaultDataFcn": function() {return {"selected": 0};},
                "numInputs": 1,
                "numOutputs": 2,
                "yesNoOutput": false,
                "initialWidthPx": 200,
                "initialHeightPx": 174,
                "componentSelect": PictureSelect,
                "componentWindow": PictureWindow,
                "componentEdit": PictureEdit,
            },
            {
                "componentTypeName": "ageselector",
                "componentGroup": "group2",
                "componentSearchText": "person age old",
                "defaultDataFcn": function() {return {"agerange": '18 ~ 24'};},
                "numInputs": 1,
                "numOutputs": 2,
                "yesNoOutput": true,
                "initialWidthPx": 200,
                "initialHeightPx": 140,
                "componentSelect": AgeSelect,
                "componentWindow": AgeWindow,
                "componentEdit": AgeEdit,
            },
        ];
        let updateCbkFcn = (nodeDescriptors, nodeLinks) => {
            console.log('updateCbkFcn ; nodeDescriptors', JSON.stringify(nodeDescriptors));
            console.log('updateCbkFcn ; nodeLinks', JSON.stringify(nodeLinks));
        };
	let nodeidBorderColor = {
		// https://www.color-hex.com/
		// 2: '#4c616a',
		// 4: '#e3b3e3',
		//  5: '#d25f2e',
	};
        return <AlWindowEditor viewOnly={false}
	                       componentAreaOpen={true} 
                               pointerDiscretization={1}
                               initialNodeDescriptors={nodeDescriptors}
                               initialNodeLinks={nodeLinks}
                               componentRegistry={componentRegistry}
                               updateCbkFcn={updateCbkFcn}
		               nodeidBorderColorMap={nodeidBorderColor}/>
	}
}




export default App;
