import React, { useState, useRef, useEffect } from 'react';
import { Upload, Calculator, Package, Clock, CheckCircle, Menu, X, Eye } from 'lucide-react';
import * as THREE from 'three';

const App = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [orderForm, setOrderForm] = useState({
    name: '',
    email: '',
    phone: '',
    comments: ''
  });
  const [calcParams, setCalcParams] = useState({
    material: 'pla',
    quality: 'standard',
    infill: 20,
    quantity: 1,
    volume: 0,
    weight: 0
  });
  const [price, setPrice] = useState(0);

  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const modelRef = useRef(null);

  const materials = {
    pla: { name: 'PLA', pricePerG: 0.03, density: 1.24 },
    abs: { name: 'ABS', pricePerG: 0.035, density: 1.04 },
    petg: { name: 'PETG', pricePerG: 0.04, density: 1.27 },
    tpu: { name: 'TPU (гибкий)', pricePerG: 0.06, density: 1.21 },
    nylon: { name: 'Nylon', pricePerG: 0.07, density: 1.14 }
  };

  const qualities = {
    draft: { name: 'Черновое (0.3мм)', multiplier: 0.8 },
    standard: { name: 'Стандартное (0.2мм)', multiplier: 1.0 },
    high: { name: 'Высокое (0.1мм)', multiplier: 1.5 },
    ultra: { name: 'Ультра (0.05мм)', multiplier: 2.0 }
  };

  useEffect(() => {
    if (sceneRef.current) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 0, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(500, 500);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);
    const gridHelper = new THREE.GridHelper(100, 20, 0x888888, 0xcccccc);
    scene.add(gridHelper);
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    const animate = () => {
      requestAnimationFrame(animate);
      if (modelRef.current) {
        modelRef.current.rotation.y += 0.005;
      }
      renderer.render(scene, camera);
    };
    animate();
    return () => {
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!mountRef.current || !rendererRef.current) return;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
    camera.updateProjectionMatrix();
    if (!mountRef.current.contains(renderer.domElement)) {
      mountRef.current.appendChild(renderer.domElement);
    }
    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [activeTab]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const extension = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        switch (extension) {
          case 'stl':
            parseSTL(event.target.result);
            break;
          case 'obj':
            parseOBJ(event.target.result);
            break;
          case 'ply':
            parsePLY(event.target.result);
            break;
          case 'gltf':
          case 'glb':
            parseGLTF(event.target.result, extension);
            break;
          default:
            alert('Неподдерживаемый формат файла');
        }
      } catch (error) {
        console.error(error);
        alert('Ошибка загрузки файла: ' + error.message);
      }
    };
    if (extension === 'obj' || extension === 'ply' || extension === 'gltf') {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  const parseSTL = (arrayBuffer) => {
    const view = new DataView(arrayBuffer);
    const isAscii = view.getUint32(0, true) > 100000000;
    let geometry;
    if (isAscii) {
      geometry = parseSTLAscii(new TextDecoder().decode(arrayBuffer));
    } else {
      geometry = parseSTLBinary(view);
    }
    displayModel(geometry);
  };

  const parseSTLBinary = (view) => {
    const triangles = view.getUint32(80, true);
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const normals = [];
    for (let i = 0; i < triangles; i++) {
      const offset = 84 + i * 50;
      const nx = view.getFloat32(offset, true);
      const ny = view.getFloat32(offset + 4, true);
      const nz = view.getFloat32(offset + 8, true);
      for (let j = 0; j < 3; j++) {
        const vOffset = offset + 12 + j * 12;
        vertices.push(
          view.getFloat32(vOffset, true),
          view.getFloat32(vOffset + 4, true),
          view.getFloat32(vOffset + 8, true)
        );
        normals.push(nx, ny, nz);
      }
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return geometry;
  };

  const parseSTLAscii = (text) => {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const normals = [];
    const lines = text.split('\n');
    let currentNormal = [0, 0, 0];
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('facet normal')) {
        const parts = line.split(/\s+/);
        currentNormal = [parseFloat(parts[2]), parseFloat(parts[3]), parseFloat(parts[4])];
      } else if (line.startsWith('vertex')) {
        const parts = line.split(/\s+/);
        vertices.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
        normals.push(...currentNormal);
      }
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return geometry;
  };

  const parseOBJ = (text) => {
    const vertices = [];
    const faces = [];
    const lines = text.split('\n');
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('v ')) {
        const parts = line.split(/\s+/);
        vertices.push({
          x: parseFloat(parts[1]),
          y: parseFloat(parts[2]),
          z: parseFloat(parts[3])
        });
      } else if (line.startsWith('f ')) {
        const parts = line.split(/\s+/).slice(1);
        const faceVertices = parts.map(p => {
          const indices = p.split('/');
          return parseInt(indices[0]) - 1;
        });
        for (let i = 1; i < faceVertices.length - 1; i++) {
          faces.push(faceVertices[0], faceVertices[i], faceVertices[i + 1]);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    for (let index of faces) {
      const vertex = vertices[index];
      positions.push(vertex.x, vertex.y, vertex.z);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    displayModel(geometry);
  };

  const parsePLY = (text) => {
    const lines = text.split('\n');
    let vertexCount = 0;
    let faceCount = 0;
    let headerEnd = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('element vertex')) {
        vertexCount = parseInt(line.split(/\s+/)[2]);
      } else if (line.startsWith('element face')) {
        faceCount = parseInt(line.split(/\s+/)[2]);
      } else if (line === 'end_header') {
        headerEnd = i + 1;
        break;
      }
    }
    const vertices = [];
    for (let i = 0; i < vertexCount; i++) {
      const parts = lines[headerEnd + i].trim().split(/\s+/);
      vertices.push({
        x: parseFloat(parts[0]),
        y: parseFloat(parts[1]),
        z: parseFloat(parts[2])
      });
    }
    const positions = [];
    for (let i = 0; i < faceCount; i++) {
      const parts = lines[headerEnd + vertexCount + i].trim().split(/\s+/);
      const count = parseInt(parts[0]);
      const indices = parts.slice(1, count + 1).map(x => parseInt(x));
      for (let j = 1; j < indices.length - 1; j++) {
        const v1 = vertices[indices[0]];
        const v2 = vertices[indices[j]];
        const v3 = vertices[indices[j + 1]];
        positions.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    displayModel(geometry);
  };

  const parseGLTF = (data, extension) => {
    try {
      let json;
      let bufferData;
      if (extension === 'gltf') {
        json = JSON.parse(data);
      } else {
        const view = new DataView(data);
        const jsonLength = view.getUint32(12, true);
        const jsonData = new Uint8Array(data, 20, jsonLength);
        json = JSON.parse(new TextDecoder().decode(jsonData));
        const binLength = view.getUint32(20 + jsonLength + 4, true);
        bufferData = data.slice(28 + jsonLength, 28 + jsonLength + binLength);
      }
      const mesh = json.meshes?.[0];
      const primitive = mesh?.primitives?.[0];
      if (!primitive) throw new Error('Нет mesh данных в GLTF');
      const posAccessor = json.accessors[primitive.attributes.POSITION];
      const posBufferView = json.bufferViews[posAccessor.bufferView];
      const positions = new Float32Array(
        bufferData || data,
        posBufferView.byteOffset || 0,
        posAccessor.count * 3
      );
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      if (primitive.indices !== undefined) {
        const indAccessor = json.accessors[primitive.indices];
        const indBufferView = json.bufferViews[indAccessor.bufferView];
        const indices = new Uint16Array(
          bufferData || data,
          indBufferView.byteOffset || 0,
          indAccessor.count
        );
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      }
      geometry.computeVertexNormals();
      displayModel(geometry);
    } catch (error) {
      alert('Ошибка парсинга GLTF. Попробуйте более простой файл.');
    }
  };

  const displayModel = (geometry) => {
    if (!sceneRef.current) {
      console.error('Сцена не инициализирована');
      return;
    }
    if (modelRef.current) {
      sceneRef.current.remove(modelRef.current);
      if (modelRef.current.geometry) modelRef.current.geometry.dispose();
      if (modelRef.current.material) modelRef.current.material.dispose();
    }
    const material = new THREE.MeshPhongMaterial({
      color: 0x3b82f6,
      shininess: 30,
      flatShading: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    mesh.position.sub(center);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 50 / maxDim;
    mesh.scale.setScalar(scale);
    sceneRef.current.add(mesh);
    modelRef.current = mesh;
    const volume = (size.x * size.y * size.z) / 1000;
    const weight = volume * materials[calcParams.material].density * (calcParams.infill / 100);
    setCalcParams(prev => ({
      ...prev,
      volume: volume.toFixed(2),
      weight: weight.toFixed(2)
    }));
    setModelLoaded(true);
    calculatePrice();
  };

  const calculatePrice = () => {
    const { material, quality, infill, quantity, weight } = calcParams;
    if (weight <= 0) {
      setPrice(0);
      return;
    }
    const materialCost = parseFloat(weight) * materials[material].pricePerG;
    const qualityCost = materialCost * qualities[quality].multiplier;
    const infillMultiplier = 0.5 + (infill / 100) * 0.5;
    const totalPerItem = qualityCost * infillMultiplier + 200;
    const total = totalPerItem * quantity;
    setPrice(total.toFixed(2));
  };

  useEffect(() => {
    calculatePrice();
  }, [calcParams]);

  const handleCalcChange = (field, value) => {
    setCalcParams(prev => {
      const newParams = { ...prev, [field]: value };
      if (field === 'material' || field === 'infill') {
        const weight = parseFloat(prev.volume) * materials[newParams.material].density * (newParams.infill / 100);
        newParams.weight = weight.toFixed(2);
      }
      return newParams;
    });
  };

  const handleSubmitOrder = (e) => {
    e.preventDefault();
    if (!modelLoaded) {
      alert('Пожалуйста, загрузите 3D модель');
      return;
    }
    alert(`Заказ оформлен!\n\nИмя: ${orderForm.name}\nEmail: ${orderForm.email}\nТелефон: ${orderForm.phone}\n\nСтоимость: ${price} руб.\nМатериал: ${materials[calcParams.material].name}\nКачество: ${qualities[calcParams.quality].name}\nКоличество: ${calcParams.quantity} шт.`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-md sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-blue-600">3D Print Lab</h1>
            <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <nav className="hidden md:flex space-x-6">
              <button onClick={() => setActiveTab('home')} className={`${activeTab === 'home' ? 'text-blue-600 font-semibold' : 'text-gray-600'} hover:text-blue-600 transition`}>Главная</button>
              <button onClick={() => setActiveTab('upload')} className={`${activeTab === 'upload' ? 'text-blue-600 font-semibold' : 'text-gray-600'} hover:text-blue-600 transition`}>Загрузить модель</button>
              <button onClick={() => setActiveTab('calculator')} className={`${activeTab === 'calculator' ? 'text-blue-600 font-semibold' : 'text-gray-600'} hover:text-blue-600 transition`}>Калькулятор</button>
              <button onClick={() => setActiveTab('order')} className={`${activeTab === 'order' ? 'text-blue-600 font-semibold' : 'text-gray-600'} hover:text-blue-600 transition`}>Оформить заказ</button>
            </nav>
          </div>
          {menuOpen && (
            <nav className="md:hidden mt-4 flex flex-col space-y-2">
              <button onClick={() => { setActiveTab('home'); setMenuOpen(false); }} className="text-left py-2 text-gray-600 hover:text-blue-600">Главная</button>
              <button onClick={() => { setActiveTab('upload'); setMenuOpen(false); }} className="text-left py-2 text-gray-600 hover:text-blue-600">Загрузить модель</button>
              <button onClick={() => { setActiveTab('calculator'); setMenuOpen(false); }} className="text-left py-2 text-gray-600 hover:text-blue-600">Калькулятор</button>
              <button onClick={() => { setActiveTab('order'); setMenuOpen(false); }} className="text-left py-2 text-gray-600 hover:text-blue-600">Оформить заказ</button>
            </nav>
          )}
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        {activeTab === 'home' && (
          <div>
            <section className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl p-12 mb-8">
              <h2 className="text-4xl font-bold mb-4">Профессиональная 3D-печать онлайн</h2>
              <p className="text-xl mb-6">Загрузите вашу модель, рассчитайте стоимость и получите готовое изделие за 24-48 часов</p>
              <button onClick={() => setActiveTab('upload')} className="bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition">Начать работу</button>
            </section>
            <section className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-lg shadow-md"><Upload className="text-blue-600 mb-4" size={40} /><h3 className="text-xl font-semibold mb-2">Легкая загрузка</h3><p className="text-gray-600">Просто загрузите файл и сразу увидите 3D визуализацию вашей модели</p></div>
              <div className="bg-white p-6 rounded-lg shadow-md"><Calculator className="text-blue-600 mb-4" size={40} /><h3 className="text-xl font-semibold mb-2">Точный расчет</h3><p className="text-gray-600">Автоматический расчет стоимости с учетом всех параметров печати</p></div>
              <div className="bg-white p-6 rounded-lg shadow-md"><Clock className="text-blue-600 mb-4" size={40} /><h3 className="text-xl font-semibold mb-2">Быстрое производство</h3><p className="text-gray-600">Изготовление и доставка в течение 24-48 часов</p></div>
            </section>
            <section className="bg-white rounded-lg shadow-md p-8 mb-8">
              <h3 className="text-2xl font-bold mb-6">Поддерживаемые форматы</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="border border-gray-200 rounded-lg p-4"><Package className="text-blue-600 mb-2" size={30} /><h4 className="font-semibold text-lg">STL</h4><p className="text-gray-600 text-sm">Стандартный формат для 3D-печати</p></div>
                <div className="border border-gray-200 rounded-lg p-4"><Package className="text-blue-600 mb-2" size={30} /><h4 className="font-semibold text-lg">OBJ</h4><p className="text-gray-600 text-sm">Популярный формат 3D-моделей</p></div>
                <div className="border border-gray-200 rounded-lg p-4"><Package className="text-blue-600 mb-2" size={30} /><h4 className="font-semibold text-lg">PLY</h4><p className="text-gray-600 text-sm">Формат для сканированных моделей</p></div>
                <div className="border border-gray-200 rounded-lg p-4"><Package className="text-blue-600 mb-2" size={30} /><h4 className="font-semibold text-lg">GLTF</h4><p className="text-gray-600 text-sm">Современный формат 3D-графики</p></div>
                <div className="border border-gray-200 rounded-lg p-4"><Package className="text-blue-600 mb-2" size={30} /><h4 className="font-semibold text-lg">GLB</h4><p className="text-gray-600 text-sm">Бинарная версия GLTF</p></div>
              </div>
            </section>
            <section className="bg-white rounded-lg shadow-md p-8 mb-8">
              <h3 className="text-2xl font-bold mb-6">Доступные материалы</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(materials).map(([key, mat]) => (
                  <div key={key} className="border border-gray-200 rounded-lg p-4"><Package className="text-blue-600 mb-2" size={30} /><h4 className="font-semibold text-lg">{mat.name}</h4><p className="text-gray-600 text-sm">От {mat.pricePerG} руб/г</p></div>
                ))}
              </div>
            </section>
            <section className="bg-white rounded-lg shadow-md p-8">
              <h3 className="text-2xl font-bold mb-6">Как это работает</h3>
              <div className="space-y-6">
                <div className="flex items-start"><div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">1</div><div><h4 className="font-semibold text-lg mb-1">Загрузите 3D модель</h4><p className="text-gray-600">Поддерживаются файлы STL, OBJ, PLY, GLTF, GLB. Вы сразу увидите визуализацию вашей модели.</p></div></div>
                <div className="flex items-start"><div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">2</div><div><h4 className="font-semibold text-lg mb-1">Выберите параметры</h4><p className="text-gray-600">Материал, качество печати, заполнение и количество копий.</p></div></div>
                <div className="flex items-start"><div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">3</div><div><h4 className="font-semibold text-lg mb-1">Рассчитайте стоимость</h4><p className="text-gray-600">Система автоматически рассчитает точную стоимость вашего заказа.</p></div></div>
                <div className="flex items-start"><div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">4</div><div><h4 className="font-semibold text-lg mb-1">Оформите заказ</h4><p className="text-gray-600">Заполните контактные данные и мы свяжемся с вами для подтверждения.</p></div></div>
              </div>
            </section>
          </div>
        )}
        {activeTab === 'upload' && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-2xl font-bold mb-4">Загрузка 3D модели</h3>
              {!sceneRef.current && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-blue-800 text-sm">⏳ Инициализация 3D движка...</p>
                </div>
              )}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Upload className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-600 mb-2">Перетащите 3D файл сюда или выберите файл</p>
                <p className="text-sm text-gray-500 mb-4">Поддерживаемые форматы: STL, OBJ, PLY, GLTF, GLB</p>
                <input type="file" accept=".stl,.obj,.ply,.gltf,.glb" onChange={handleFileUpload} className="hidden" id="file-upload" />
                <label htmlFor="file-upload" className="bg-blue-600 text-white px-6 py-2 rounded-lg cursor-pointer hover:bg-blue-700 transition inline-block">Выбрать файл</label>
              </div>
              {modelLoaded && (
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center text-green-700">
                    <CheckCircle className="mr-2" size={20} />
                    <span className="font-semibold">Модель успешно загружена!</span>
                  </div>
                  <div className="mt-3 text-sm text-gray-700">
                    <p>Объем: {calcParams.volume} см³</p>
                    <p>Вес материала: {calcParams.weight} г</p>
                  </div>
                </div>
              )}
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-2xl font-bold mb-4">Предпросмотр 3D модели</h3>
              <div ref={mountRef} className="w-full h-96 bg-gray-100 rounded-lg border border-gray-300" />
              {modelLoaded && (
                <p className="text-sm text-gray-600 mt-2 flex items-center">
                  <Eye className="mr-2" size={16} />
                  Модель вращается автоматически
                </p>
              )}
            </div>
          </div>
        )}
        {activeTab === 'calculator' && (
          <div className="bg-white rounded-lg shadow-md p-6 max-w-3xl mx-auto">
            <h3 className="text-2xl font-bold mb-6">Калькулятор стоимости</h3>
            {!modelLoaded && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-yellow-800">Сначала загрузите 3D модель во вкладке "Загрузить модель" для точного расчета</p>
              </div>)}
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold mb-2">Материал</label>
                <select value={calcParams.material} onChange={(e) => handleCalcChange('material', e.target.value)} className="w-full border border-gray-300 rounded-lg px-4 py-2">
                  {Object.entries(materials).map(([key, mat]) => (
                    <option key={key} value={key}>{mat.name} - {mat.pricePerG} руб/г</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Качество печати</label>
                <select value={calcParams.quality} onChange={(e) => handleCalcChange('quality', e.target.value)} className="w-full border border-gray-300 rounded-lg px-4 py-2">
                  {Object.entries(qualities).map(([key, qual]) => (
                    <option key={key} value={key}>{qual.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Заполнение: {calcParams.infill}%</label>
                <input type="range" min="10" max="100" step="5" value={calcParams.infill} onChange={(e) => handleCalcChange('infill', parseInt(e.target.value))} className="w-full" />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>10%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Количество копий</label>
                <input type="number" min="1" max="100" value={calcParams.quantity} onChange={(e) => handleCalcChange('quantity', parseInt(e.target.value))} className="w-full border border-gray-300 rounded-lg px-4 py-2" />
              </div>
              <div className="border-t pt-6">
                <div className="bg-blue-50 rounded-lg p-6">
                  <h4 className="text-lg font-semibold mb-4">Детали расчета</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Объем модели:</span>
                      <span className="font-semibold">{calcParams.volume} см³</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Вес материала:</span>
                      <span className="font-semibold">{calcParams.weight} г</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Материал:</span>
                      <span className="font-semibold">{materials[calcParams.material].name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Качество:</span>
                      <span className="font-semibold">{qualities[calcParams.quality].name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Количество:</span>
                      <span className="font-semibold">{calcParams.quantity} шт.</span>
                    </div>
                  </div>
                  <div className="border-t border-blue-200 mt-4 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xl font-bold">Итого:</span>
                      <span className="text-3xl font-bold text-blue-600">{price} ₽</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'order' && (
          <div className="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
            <h3 className="text-2xl font-bold mb-6">Оформление заказа</h3>
            {!modelLoaded && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-red-800">Пожалуйста, сначала загрузите 3D модель и рассчитайте стоимость</p>
              </div>
            )}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h4 className="font-semibold mb-2">Детали заказа:</h4>
              <p className="text-sm text-gray-700">Материал: {materials[calcParams.material].name}</p>
              <p className="text-sm text-gray-700">Качество: {qualities[calcParams.quality].name}</p>
              <p className="text-sm text-gray-700">Количество: {calcParams.quantity} шт.</p>
              <p className="text-lg font-bold text-blue-600 mt-2">Стоимость: {price} ₽</p>
            </div>
            <form onSubmit={handleSubmitOrder} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Имя *</label>
                <input type="text" required value={orderForm.name} onChange={(e) => setOrderForm({ ...orderForm, name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-4 py-2" placeholder="Иван Иванов" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Email *</label>
                <input type="email" required value={orderForm.email} onChange={(e) => setOrderForm({ ...orderForm, email: e.target.value })} className="w-full border border-gray-300 rounded-lg px-4 py-2" placeholder="ivan@example.com" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Телефон *</label>
                <input type="tel" required value={orderForm.phone} onChange={(e) => setOrderForm({ ...orderForm, phone: e.target.value })} className="w-full border border-gray-300 rounded-lg px-4 py-2" placeholder="+7 (999) 123-45-67" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Комментарий к заказу</label>
                <textarea value={orderForm.comments} onChange={(e) => setOrderForm({ ...orderForm, comments: e.target.value })} className="w-full border border-gray-300 rounded-lg px-4 py-2 h-32" placeholder="Дополнительные пожелания, адрес доставки..." />
              </div>
              <button type="submit" disabled={!modelLoaded} className={`w-full py-3 rounded-lg font-semibold text-white transition ${modelLoaded ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}`}>Оформить заказ на {price} ₽</button>
            </form>
            <div className="mt-6 text-sm text-gray-600">
              <p>* После оформления заказа мы свяжемся с вами в течение 1 часа для подтверждения деталей.</p>
              <p className="mt-2">* Срок изготовления: 24-48 часов с момента подтверждения.</p>
            </div>
          </div>
        )}
      </main>
      <footer className="bg-gray-800 text-white mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h4 className="font-bold text-lg mb-4">3D Print Lab</h4>
              <p className="text-gray-400 text-sm">Профессиональная 3D-печать с точным расчетом стоимости и быстрым изготовлением.</p>
            </div>
            <div>
              <h4 className="font-bold text-lg mb-4">Контакты</h4>
              <p className="text-gray-400 text-sm">Email: info@3dprintlab.ru</p>
              <p className="text-gray-400 text-sm">Телефон: +7 (999) 123-45-67</p>
              <p className="text-gray-400 text-sm">Адрес: г. Москва, ул. Примерная, 123</p>
            </div>
            <div>
              <h4 className="font-bold text-lg mb-4">Режим работы</h4>
              <p className="text-gray-400 text-sm">Пн-Пт: 9:00 - 18:00</p>
              <p className="text-gray-400 text-sm">Сб-Вс: 10:00 - 16:00</p>
            </div>
          </div>
          <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400 text-sm">
            <p>&copy; 2025 3D Print Lab. Все права защищены.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;