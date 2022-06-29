/* Comment */

// var val1 = "var変数";
// console.log(val1);

// // var変数は上書き可能
// val1 = "var変数を上書き";
// console.log(val1);

// var val1 = "var redefined";
// console.log(val1);

// let val2 = "let var";
// console.log(val2);

// template string
// const name = "tsuyoshi";
// const age = 48;

// const message1 = "my name is " + name + ".age is " + age + ".";
// console.log(message1);

// // `
// const message2 = `my name is ${name}.age is ${age}.`;
// console.log(message2);

// // function
// function func1(str) {
//   return str;
// }
// console.log(func1("func1"));

// // function to variant
// const func2 = function (str) {
//   return str;
// };
// console.log(func2("func2"));

// // arrow function
// const func3 = (str) => {
//  return str;
// }
// console.log(func3("func3"));

// // arrow return syouryaku
// const func4 = (str) => str;
// console.log(func4("func4"));

// // example 2
// const func5 = (num1,num2) => {
//   return num1+num2;
// }
// console.log(func5(10,20));

// // bunkatsu dainyu
// const myProf = {
//    name: "tsuyoshi",
//    age: 48,
// }

// const mes1 = `name:${myProf.name}.age:${myProf.age}.`;
// console.log(mes1);

// const {name,age} = myProf;
// const mes2 = `name:${name}. age:${age}.`;
// console.log(mes2);

// const myprof = ['tsuyoshi',48];
// const mes3 = `name:${myprof[0]}.age:${myprof[1]}`;
// console.log(mes3);
// //配列の分割代入は添字の順番
// const [name,age] = myprof;
// const mes4 = `name:${name}.age:${age}`;
// console.log(mes4);

// // default argument
// const sayHello = (name = "Guest") => console.log(`hello! Sir.${name}.`);
// sayHello("tsuyoshi");
// sayHello();

// Spread koubun bunkatsu
// haretu no tenkai
// const arr1 = [1,2];
// console.log(arr1);
// console.log(...arr1);

// const sumFunc = (num1, num2) => console.log(num1 + num2);
// sumFunc(arr1[0],arr1[1]);
// sumFunc(...arr1);

// // Spread koubun matomeru
// const arr2 = [1,2,3,4,5];
// const [num1,num2, ...arr3] = arr2;
// console.log(num1);
// console.log(num2);
// console.log(arr3);

// // array copy ketsugou
const arr4 = [10, 20];
const arr5 = [30, 40];

// -- atai watasi
const arr99 = [...arr4];
arr99[0] = 1002;
console.log(arr99);
console.log(arr4);

// const arr6 = [...arr4];
// console.log(arr6);
// const arr7 = [...arr4, ...arr5];
// console.log(arr7);

//下記は参照渡し　なのでarr4も変わる
// const arr8 = arr4;
// console.log(arr8);
// arr4[0]=1001;
// console.log(arr8);
// console.log(arr4);
